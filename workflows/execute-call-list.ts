import { sleep } from "workflow";
import { start } from "workflow/api";
import { db, withRetry } from "@/lib/db";
import {
  callLists,
  callEntries,
  calls,
  agentCredentials,
} from "@/lib/schema";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { initiateOutboundCall } from "@/lib/elevenlabs";
import type { CallEntry } from "@/lib/types";
import { callCompletedHook } from "./hooks";
import { analyzeCallTranscript } from "./analyze-call-transcript";

interface BotCredential {
  id: string;
  elevenlabs_api_key: string;
  elevenlabs_agent_id: string;
  telephony_provider: "twilio" | "didww";
  elevenlabs_phone_number_id: string | null;
  didww_phone_number: string | null;
  outbound_caller_id: string | null;
}

interface BatchResult {
  entryId: string;
  success: boolean;
  conversationId?: string;
  botIndex: number;
}

export async function executeCallList(
  callListId: string,
  agentId: string,
  botCredentialIds?: string[]
) {
  "use workflow";

  const entries = await fetchPendingEntries(callListId);
  if (entries.length === 0) {
    await finalize(callListId);
    return;
  }

  const allBots = await fetchCredentials(agentId, botCredentialIds);
  const botCount = allBots.length;

  for (
    let batchStart = 0;
    batchStart < entries.length;
    batchStart += botCount
  ) {
    const batch = entries.slice(batchStart, batchStart + botCount);

    const batchResults = await placeBatch(callListId, batch, allBots);
    if (batchResults === null) break; // list paused/cancelled

    const successfulCalls = batchResults.filter(
      (r) => r.success && r.conversationId
    );

    // Wait for each call to complete (or time out after 60s and poll)
    for (const call of successfulCalls) {
      if (!call.conversationId) continue;
      const completionPayload = await waitForCallCompletion(
        call.conversationId,
        allBots[call.botIndex].elevenlabs_api_key
      );

      // If the webhook delivered transcript data, kick off analysis here
      // (start() is reliable from workflow context)
      if (
        completionPayload?.status === "done" &&
        completionPayload.transcriptText &&
        completionPayload.transcriptText.length > 0
      ) {
        await start(analyzeCallTranscript, [
          {
            conversationId: call.conversationId,
            transcriptText: completionPayload.transcriptText,
            callDurationSecs: completionPayload.durationSecs ?? 0,
            cost: completionPayload.cost ?? 0,
            recordingUrl:
              completionPayload.recordingUrl ??
              `https://elevenlabs.io/app/conversational-ai/history/${call.conversationId}`,
          },
        ]);
      }
    }

    // 10-15s buffer between batches (deterministic pseudo-random)
    const bufferSecs = 10 + (batchStart % 6);
    await sleep(`${bufferSecs}s`);
  }

  await autoSync(callListId, allBots);
  await finalize(callListId);
}

// ============================================================
// Workflow helper (no 'use step' — this manages hook lifecycle)
// ============================================================

type HookPayload = {
  conversationId: string;
  status?: string;
  transcriptText?: string;
  durationSecs?: number;
  cost?: number;
  recordingUrl?: string;
};

async function waitForCallCompletion(
  conversationId: string,
  apiKey: string
): Promise<HookPayload | null> {
  "use workflow";

  // Phase 1: wait 60s for the webhook
  const hook = callCompletedHook.create({ token: conversationId });
  try {
    const race = await Promise.race([
      Promise.resolve(hook).then((v) => ({ timedOut: false as const, value: v })),
      sleep("60s").then(() => ({ timedOut: true as const, value: null })),
    ]);

    if (!race.timedOut) return race.value;

    // Phase 2: webhook didn't arrive — poll ElevenLabs
    const stillActive = await pollCallStatus(conversationId, apiKey);
    if (!stillActive) return null; // call ended, auto-sync will handle it

    // Phase 3: call still in progress, wait one more 60s
    const hook2 = callCompletedHook.create({ token: conversationId });
    try {
      const race2 = await Promise.race([
        Promise.resolve(hook2).then((v) => ({ timedOut: false as const, value: v })),
        sleep("60s").then(() => ({ timedOut: true as const, value: null })),
      ]);
      return race2.value;
    } finally {
      hook2.dispose();
    }
  } finally {
    hook.dispose();
  }
}

// ============================================================
// Steps (each 'use step' — durable, cached, retried)
// ============================================================

async function fetchPendingEntries(callListId: string): Promise<CallEntry[]> {
  "use step";
  return db
    .select()
    .from(callEntries)
    .where(
      and(
        eq(callEntries.callListId, callListId),
        eq(callEntries.callStatus, "pending")
      )
    )
    .orderBy(asc(callEntries.sortOrder));
}

async function fetchCredentials(
  agentId: string,
  botCredentialIds: string[] | undefined
): Promise<BotCredential[]> {
  "use step";
  const creds = botCredentialIds?.length
    ? await db
        .select()
        .from(agentCredentials)
        .where(inArray(agentCredentials.id, botCredentialIds))
    : await db
        .select()
        .from(agentCredentials)
        .where(
          and(
            eq(agentCredentials.agentId, agentId),
            eq(agentCredentials.credentialsComplete, true)
          )
        );

  if (creds.length === 0) throw new Error("No credentials found for agent");

  return creds.map((cred) => ({
    id: cred.id,
    elevenlabs_api_key: decrypt(cred.elevenlabsApiKey),
    elevenlabs_agent_id: cred.elevenlabsAgentId,
    telephony_provider: cred.telephonyProvider as "twilio" | "didww",
    elevenlabs_phone_number_id: cred.elevenlabsPhoneNumberId,
    didww_phone_number: cred.didwwPhoneNumber,
    outbound_caller_id: cred.outboundCallerId,
  }));
}

async function placeBatch(
  callListId: string,
  batch: CallEntry[],
  allBots: BotCredential[]
): Promise<BatchResult[] | null> {
  "use step";

  const botCount = allBots.length;

  // Check list status before placing calls
  const [listStatus] = await db
    .select({ callStatus: callLists.callStatus })
    .from(callLists)
    .where(eq(callLists.id, callListId))
    .limit(1);
  if (listStatus?.callStatus !== "in_progress") {
    return null;
  }

  const callPromises = batch.map(async (entry, i): Promise<BatchResult> => {
    const bot = allBots[i % botCount];
    try {
      // Idempotency: skip if entry is no longer pending
      const [current] = await db
        .select({ callStatus: callEntries.callStatus })
        .from(callEntries)
        .where(eq(callEntries.id, entry.id))
        .limit(1);
      if (current && current.callStatus !== "pending") {
        return { entryId: entry.id, success: false, botIndex: i % botCount };
      }

      await withRetry(
        () =>
          db
            .update(callEntries)
            .set({
              callStatus: "calling",
              callStartedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(callEntries.id, entry.id)),
        { label: "mark-calling" }
      );

      const result = await initiateOutboundCall(bot, entry.phoneNumber);

      await withRetry(
        () =>
          db
            .update(callEntries)
            .set({
              conversationId: result.conversation_id,
              telephonyCallSid: result.callSid || null,
              callStatus: "called",
              updatedAt: new Date(),
            })
            .where(eq(callEntries.id, entry.id)),
        { label: "mark-called" }
      );

      await withRetry(
        () =>
          db.insert(calls).values({
            callEntryId: entry.id,
            conversationId: result.conversation_id,
            callId: result.callSid || null,
            callingNumber: bot.outbound_caller_id,
            phoneNumber: entry.phoneNumber,
            numberStatus: "busy",
            elevenlabsAgentId: bot.elevenlabs_agent_id,
          }),
        { label: "insert-call" }
      );

      await withRetry(
        () =>
          db
            .update(callLists)
            .set({ callsMade: sql`${callLists.callsMade} + 1` })
            .where(eq(callLists.id, callListId)),
        { label: "increment-made" }
      );

      return {
        entryId: entry.id,
        success: true,
        conversationId: result.conversation_id,
        botIndex: i % botCount,
      };
    } catch (err) {
      console.error(`[batch] Failed to call ${entry.phoneNumber}:`, err);
      try {
        await withRetry(
          () =>
            db
              .update(callEntries)
              .set({ callStatus: "failed", updatedAt: new Date() })
              .where(eq(callEntries.id, entry.id)),
          { label: "mark-failed" }
        );
        await withRetry(
          () =>
            db
              .update(callLists)
              .set({ callsFailed: sql`${callLists.callsFailed} + 1` })
              .where(eq(callLists.id, callListId)),
          { label: "increment-failed" }
        );
      } catch (dbErr) {
        console.error(`[batch] DB error marking failure:`, dbErr);
      }
      return { entryId: entry.id, success: false, botIndex: i % botCount };
    }
  });

  const settled = await Promise.allSettled(callPromises);
  const results: BatchResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") results.push(r.value);
  }
  return results;
}

async function pollCallStatus(
  conversationId: string,
  apiKey: string
): Promise<boolean> {
  "use step";
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (!res.ok) return false;
    const conv = await res.json();
    const status = conv.status;
    return (
      status === "processing" ||
      status === "in-progress" ||
      status === "in_progress"
    );
  } catch {
    return false;
  }
}

async function autoSync(callListId: string, allBots: BotCredential[]) {
  "use step";

  const staleEntries = await db
    .select()
    .from(callEntries)
    .where(
      and(
        eq(callEntries.callListId, callListId),
        inArray(callEntries.callStatus, ["called", "calling"])
      )
    );

  if (staleEntries.length === 0) return;

  for (const entry of staleEntries) {
    if (!entry.conversationId) continue;

    const [callRecord] = await db
      .select({ elevenlabsAgentId: calls.elevenlabsAgentId })
      .from(calls)
      .where(eq(calls.conversationId, entry.conversationId))
      .limit(1);

    const matchingBot = callRecord
      ? allBots.find(
          (b) => b.elevenlabs_agent_id === callRecord.elevenlabsAgentId
        )
      : null;
    const apiKey =
      matchingBot?.elevenlabs_api_key || allBots[0].elevenlabs_api_key;

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${entry.conversationId}`,
        { headers: { "xi-api-key": apiKey } }
      );
      if (!res.ok) continue;

      const conv = await res.json();
      const status = conv.status;
      const durationSecs =
        conv.metadata?.call_duration_secs ||
        conv.metadata?.duration_secs ||
        0;
      const cost = conv.metadata?.cost || conv.call_cost || 0;

      let newEntryStatus: "answered" | "no_answer" | "failed";
      if (status === "done") {
        newEntryStatus = "answered";
      } else {
        const terminationReason =
          conv.metadata?.termination_reason ||
          conv.termination_reason ||
          conv.status;
        const isNoAnswer =
          terminationReason === "no_answer" ||
          terminationReason === "no-answer" ||
          status === "no-answer" ||
          status === "no_answer" ||
          durationSecs < 5;
        newEntryStatus = isNoAnswer ? "no_answer" : "failed";
      }

      await db
        .update(callEntries)
        .set({
          callStatus: newEntryStatus,
          callDurationSeconds: durationSecs,
          callEndedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(callEntries.id, entry.id));

      await db
        .update(calls)
        .set({
          numberStatus: "idle",
          duration: durationSecs,
          callCost: cost?.toString() || null,
        })
        .where(eq(calls.conversationId, entry.conversationId));

      if (newEntryStatus === "answered") {
        await db
          .update(callLists)
          .set({ callsAnswered: sql`${callLists.callsAnswered} + 1` })
          .where(eq(callLists.id, callListId));
      } else if (newEntryStatus === "no_answer") {
        await db
          .update(callLists)
          .set({ callsNoAnswer: sql`${callLists.callsNoAnswer} + 1` })
          .where(eq(callLists.id, callListId));
      } else {
        await db
          .update(callLists)
          .set({ callsFailed: sql`${callLists.callsFailed} + 1` })
          .where(eq(callLists.id, callListId));
      }

      if (status === "done" && conv.transcript) {
        const transcriptText = (
          Array.isArray(conv.transcript) ? conv.transcript : []
        )
          .filter(
            (e: { role?: string; message?: string }) => e.role && e.message
          )
          .map(
            (e: { role: string; message: string }) =>
              `${e.role}: ${e.message}`
          )
          .join("\n");

        if (transcriptText.length > 0) {
          await start(analyzeCallTranscript, [
            {
              conversationId: entry.conversationId,
              transcriptText,
              callDurationSecs: durationSecs,
              cost: cost || 0,
              recordingUrl: `https://elevenlabs.io/app/conversational-ai/history/${entry.conversationId}`,
            },
          ]);
        }
      }

      console.log(`[auto-sync] Entry ${entry.id} → ${newEntryStatus}`);
    } catch (err) {
      console.error(`[auto-sync] Failed to sync entry ${entry.id}:`, err);
    }
  }
}

async function finalize(callListId: string) {
  "use step";
  const [list] = await db
    .select()
    .from(callLists)
    .where(eq(callLists.id, callListId))
    .limit(1);

  if (list && list.callStatus !== "cancelled") {
    await db
      .update(callLists)
      .set({ callStatus: "completed", completedAt: new Date() })
      .where(eq(callLists.id, callListId));
  }
}
