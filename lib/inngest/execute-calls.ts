import { inngest } from "./client";
import { db } from "@/lib/db";
import { callLists, callEntries, calls, agentCredentials } from "@/lib/schema";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { initiateOutboundCall } from "@/lib/elevenlabs";

interface BotCredential {
  id: string;
  elevenlabs_api_key: string;
  elevenlabs_agent_id: string;
  telephony_provider: "twilio" | "didww";
  elevenlabs_phone_number_id: string | null;
  didww_phone_number: string | null;
  outbound_caller_id: string | null;
}

export const executeCallList = inngest.createFunction(
  { id: "execute-call-list", retries: 0 },
  { event: "calllist/start" },
  async ({ event, step }) => {
    const { callListId, agentId, botCredentialIds } = event.data;

    const entries = await step.run("fetch-entries", async () => {
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
    });

    const allBots = await step.run("fetch-credentials", async () => {
      // Use botCredentialIds if provided, otherwise fetch all for agent
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

      return creds.map(
        (cred): BotCredential => ({
          id: cred.id,
          elevenlabs_api_key: decrypt(cred.elevenlabsApiKey),
          elevenlabs_agent_id: cred.elevenlabsAgentId,
          telephony_provider: cred.telephonyProvider as "twilio" | "didww",
          elevenlabs_phone_number_id: cred.elevenlabsPhoneNumberId,
          didww_phone_number: cred.didwwPhoneNumber,
          outbound_caller_id: cred.outboundCallerId,
        })
      );
    });

    const botCount = allBots.length;

    // Process entries in batches of botCount (parallel calling)
    for (
      let batchStart = 0;
      batchStart < entries.length;
      batchStart += botCount
    ) {
      // Check if we should continue
      const shouldContinue = await step.run(
        `check-batch-${batchStart}`,
        async () => {
          const [list] = await db
            .select({ callStatus: callLists.callStatus })
            .from(callLists)
            .where(eq(callLists.id, callListId))
            .limit(1);
          return list?.callStatus === "in_progress";
        }
      );

      if (!shouldContinue) break;

      const batch = entries.slice(batchStart, batchStart + botCount);

      // Place ALL calls in the batch simultaneously within a single step
      const batchResults = await step.run(
        `place-batch-${batchStart}`,
        async () => {
          const results: { entryId: string; success: boolean; conversationId?: string }[] = [];

          // Fire all calls in parallel using Promise.allSettled
          const callPromises = batch.map(async (entry, i) => {
            const bot = allBots[i % botCount];
            try {
              await db
                .update(callEntries)
                .set({
                  callStatus: "calling",
                  callStartedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(callEntries.id, entry.id));

              const result = await initiateOutboundCall(bot, entry.phoneNumber);

              await db
                .update(callEntries)
                .set({
                  conversationId: result.conversation_id,
                  telephonyCallSid: result.callSid || null,
                  callStatus: "called",
                  updatedAt: new Date(),
                })
                .where(eq(callEntries.id, entry.id));

              await db.insert(calls).values({
                callEntryId: entry.id,
                conversationId: result.conversation_id,
                callId: result.callSid || null,
                callingNumber: bot.outbound_caller_id,
                phoneNumber: entry.phoneNumber,
                numberStatus: "busy",
                elevenlabsAgentId: bot.elevenlabs_agent_id,
              });

              await db
                .update(callLists)
                .set({ callsMade: sql`${callLists.callsMade} + 1` })
                .where(eq(callLists.id, callListId));

              return { entryId: entry.id, success: true, conversationId: result.conversation_id };
            } catch (err) {
              console.error(`[batch] Failed to call ${entry.phoneNumber}:`, err);
              await db
                .update(callEntries)
                .set({ callStatus: "failed", updatedAt: new Date() })
                .where(eq(callEntries.id, entry.id));
              await db
                .update(callLists)
                .set({ callsFailed: sql`${callLists.callsFailed} + 1` })
                .where(eq(callLists.id, callListId));
              return { entryId: entry.id, success: false };
            }
          });

          const settled = await Promise.allSettled(callPromises);
          for (const r of settled) {
            if (r.status === "fulfilled") results.push(r.value);
          }
          return results;
        }
      );

      const successfulCalls = batchResults.filter(
        (r) => r.success && r.conversationId
      );

      // Wait for all successful calls in the batch to complete
      for (const call of successfulCalls) {
        await step.waitForEvent(`wait-${call.entryId}`, {
          event: "elevenlabs/call-completed",
          if: `async.data.conversation_id == '${call.conversationId}'`,
          timeout: "3m",
        });
      }

      // Random 60-90s buffer between batches
      const bufferSecs = await step.run(
        `buffer-calc-${batchStart}`,
        async () => {
          return Math.floor(Math.random() * 31) + 60;
        }
      );
      await step.sleep(`buffer-${batchStart}`, `${bufferSecs}s`);
    }

    // Auto-sync: resolve any entries still stuck as "calling"/"called"
    await step.run("auto-sync", async () => {
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

        // Find the right API key by matching the bot that made this call
        const [callRecord] = await db
          .select({ elevenlabsAgentId: calls.elevenlabsAgentId })
          .from(calls)
          .where(eq(calls.conversationId, entry.conversationId))
          .limit(1);

        // Find the bot credential for this call
        const matchingBot = callRecord
          ? allBots.find(
              (b) =>
                b.elevenlabs_agent_id === callRecord.elevenlabsAgentId
            )
          : null;
        const apiKey = matchingBot?.elevenlabs_api_key || allBots[0].elevenlabs_api_key;

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
              .set({
                callsAnswered: sql`${callLists.callsAnswered} + 1`,
              })
              .where(eq(callLists.id, callListId));
          } else if (newEntryStatus === "no_answer") {
            await db
              .update(callLists)
              .set({
                callsNoAnswer: sql`${callLists.callsNoAnswer} + 1`,
              })
              .where(eq(callLists.id, callListId));
          } else {
            await db
              .update(callLists)
              .set({
                callsFailed: sql`${callLists.callsFailed} + 1`,
              })
              .where(eq(callLists.id, callListId));
          }

          if (status === "done" && conv.transcript) {
            const transcriptText = (
              Array.isArray(conv.transcript) ? conv.transcript : []
            )
              .filter(
                (e: { role?: string; message?: string }) =>
                  e.role && e.message
              )
              .map(
                (e: { role: string; message: string }) =>
                  `${e.role}: ${e.message}`
              )
              .join("\n");

            if (transcriptText.length > 0) {
              await inngest.send({
                name: "call/analyze-transcript",
                data: {
                  conversationId: entry.conversationId,
                  transcriptText,
                  callDurationSecs: durationSecs,
                  cost: cost || 0,
                  recordingUrl: `https://elevenlabs.io/app/conversational-ai/history/${entry.conversationId}`,
                },
              });
            }
          }

          console.log(
            `[auto-sync] Entry ${entry.id} → ${newEntryStatus}`
          );
        } catch (err) {
          console.error(
            `[auto-sync] Failed to sync entry ${entry.id}:`,
            err
          );
        }
      }
    });

    // Finalize
    await step.run("finalize", async () => {
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
    });
  }
);
