import { inngest } from "./client";
import { db, withRetry } from "@/lib/db";
import { callLists, callEntries, calls, agentCredentials } from "@/lib/schema";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import {
  initiateOutboundCall,
  SIPInitiationError,
  isNoAnswerSipCode,
} from "@/lib/elevenlabs";

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
  {
    id: "execute-call-list",
    retries: 0,
    cancelOn: [{ event: "calllist/cancel", match: "data.callListId" }],
  },
  { event: "calllist/start" },
  async ({ event, step }) => {
    const { callListId, agentId, botCredentialIds, callingSessionStartedAt } =
      event.data;

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

    // Continuous-calling clock for periodic rest breaks. Sustained back-to-back
    // dialing gets numbers flagged as spam / rate-limited by carriers, so after
    // ~2–2.5h of calling we pause 10–15 min. The clock is threaded through chunk
    // handoffs via event data so it spans fresh function runs rather than
    // resetting every 100 entries.
    let sessionStartedAt = await step.run(
      "init-session-clock",
      async () => callingSessionStartedAt ?? Date.now()
    );

    // Chunk execution to stay under Inngest's step-count-per-run limit.
    // Each entry uses 1 place-batch step + 1 buffer sleep + up to
    // 2 * MAX_WAIT_ITERATIONS (wait + poll per attempt). Typical entries with
    // a call that ends inside 60s use ~3 steps; a 5-min call uses ~13 steps.
    // 100 entries at mixed durations stays within Inngest's per-run budget.
    const MAX_ENTRIES_PER_RUN = 100;
    let entriesProcessedThisRun = 0;

    // Process entries in batches of botCount (parallel calling)
    for (
      let batchStart = 0;
      batchStart < entries.length;
      batchStart += botCount
    ) {
      const batch = entries.slice(batchStart, batchStart + botCount);

      // Place ALL calls in the batch simultaneously within a single step.
      // The status check is inlined here to save an Inngest step per batch.
      const batchResults = await step.run(
        `place-batch-${batchStart}`,
        async () => {
          // Check if list is still in_progress before placing calls
          const [listStatus] = await db
            .select({ callStatus: callLists.callStatus })
            .from(callLists)
            .where(eq(callLists.id, callListId))
            .limit(1);
          if (listStatus?.callStatus !== "in_progress") {
            return null; // signals: stop processing
          }

          const results: { entryId: string; success: boolean; conversationId?: string; botIndex: number }[] = [];

          // Fire all calls in parallel using Promise.allSettled
          const callPromises = batch.map(async (entry, i) => {
            const bot = allBots[i % botCount];
            try {
              // Idempotency check: skip if entry was already called (e.g. by a concurrent execution)
              const [current] = await db
                .select({ callStatus: callEntries.callStatus })
                .from(callEntries)
                .where(eq(callEntries.id, entry.id))
                .limit(1);
              if (current && current.callStatus !== "pending") {
                console.log(`[batch] Skipping ${entry.phoneNumber}: already ${current.callStatus}`);
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

              return { entryId: entry.id, success: true, conversationId: result.conversation_id, botIndex: i % botCount };
            } catch (err) {
              console.error(`[batch] Failed to call ${entry.phoneNumber}:`, err);
              try {
                // SIPInitiationError: ElevenLabs accepted the request but SIP failed
                // (phone off, busy, declined, canceled). Classify by SIP code rather
                // than lumping everything into "failed".
                if (err instanceof SIPInitiationError) {
                  const isNoAnswer = isNoAnswerSipCode(err.sipCode);
                  const newStatus = isNoAnswer ? "no_answer" : "failed";

                  await withRetry(
                    () =>
                      db
                        .update(callEntries)
                        .set({
                          callStatus: newStatus,
                          conversationId: err.conversationId,
                          updatedAt: new Date(),
                        })
                        .where(eq(callEntries.id, entry.id)),
                    { label: "mark-sip-failure" }
                  );

                  if (err.conversationId) {
                    await withRetry(
                      () =>
                        db.insert(calls).values({
                          callEntryId: entry.id,
                          conversationId: err.conversationId!,
                          callingNumber: bot.outbound_caller_id,
                          phoneNumber: entry.phoneNumber,
                          numberStatus: "idle",
                          elevenlabsAgentId: bot.elevenlabs_agent_id,
                        }),
                      { label: "insert-sip-failed-call" }
                    );
                  }

                  if (isNoAnswer) {
                    await withRetry(
                      () =>
                        db
                          .update(callLists)
                          .set({ callsNoAnswer: sql`${callLists.callsNoAnswer} + 1` })
                          .where(eq(callLists.id, callListId)),
                      { label: "increment-no-answer" }
                    );
                  } else {
                    await withRetry(
                      () =>
                        db
                          .update(callLists)
                          .set({ callsFailed: sql`${callLists.callsFailed} + 1` })
                          .where(eq(callLists.id, callListId)),
                      { label: "increment-failed" }
                    );
                  }
                } else {
                  // Network/timeout/5xx errors: classic failure, mark entry failed.
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
                }
              } catch (dbErr) {
                console.error(`[batch] DB error marking failure:`, dbErr);
              }
              return { entryId: entry.id, success: false, botIndex: i % botCount };
            }
          });

          const settled = await Promise.allSettled(callPromises);
          for (const r of settled) {
            if (r.status === "fulfilled") results.push(r.value);
          }
          return results;
        }
      );

      if (batchResults === null) break; // list paused/cancelled

      const successfulCalls = batchResults.filter(
        (r) => r.success && r.conversationId
      );

      // Wait for each successful call to actually complete before moving on.
      // Loop (waitForEvent 60s → poll ElevenLabs) until EL confirms the call
      // ended, or until MAX_WAIT_ITERATIONS. Insurance conversations regularly
      // run 3–10 minutes; without looping, the next number would be dialed
      // while the previous call is still live (Victoria's incident).
      const MAX_WAIT_ITERATIONS = 15; // 15 * 60s = 15-minute hard cap per call
      for (const call of successfulCalls) {
        const waitStartMs = Date.now();
        console.log(
          `[execute-calls] wait-loop start entry=${call.entryId} conv=${call.conversationId}`
        );
        let exitReason = "max-iterations";
        for (let attempt = 0; attempt < MAX_WAIT_ITERATIONS; attempt++) {
          const webhookEvent = await step.waitForEvent(
            `wait-${call.entryId}-${attempt}`,
            {
              event: "elevenlabs/call-completed",
              if: `async.data.conversation_id == '${call.conversationId}'`,
              timeout: "60s",
            }
          );
          if (webhookEvent) {
            exitReason = `webhook@attempt=${attempt}`;
            break;
          }

          const callStillActive = await step.run(
            `poll-${call.entryId}-${attempt}`,
            async () => {
              const bot = allBots[call.botIndex];
              // 30s abort mirrors initiateOutboundCall — without it a hung EL
              // response can block the whole loop indefinitely.
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 30000);
              const pollStartMs = Date.now();
              try {
                const res = await fetch(
                  `https://api.elevenlabs.io/v1/convai/conversations/${call.conversationId}`,
                  {
                    headers: { "xi-api-key": bot.elevenlabs_api_key },
                    signal: controller.signal,
                  }
                );
                clearTimeout(timer);
                if (!res.ok) {
                  console.log(
                    `[execute-calls] poll entry=${call.entryId} attempt=${attempt} httpStatus=${res.status} tookMs=${Date.now() - pollStartMs}`
                  );
                  return false;
                }
                const conv = await res.json();
                const status = conv.status;
                console.log(
                  `[execute-calls] poll entry=${call.entryId} attempt=${attempt} elStatus=${status} tookMs=${Date.now() - pollStartMs}`
                );
                return (
                  status === "processing" ||
                  status === "in-progress" ||
                  status === "in_progress"
                );
              } catch (err) {
                clearTimeout(timer);
                const reason =
                  err instanceof Error && err.name === "AbortError"
                    ? "abort-timeout"
                    : err instanceof Error
                      ? err.message
                      : "unknown";
                console.log(
                  `[execute-calls] poll entry=${call.entryId} attempt=${attempt} err=${reason} tookMs=${Date.now() - pollStartMs}`
                );
                return false; // On error assume ended, move on
              }
            }
          );
          if (!callStillActive) {
            exitReason = `poll-inactive@attempt=${attempt}`;
            break;
          }
          if (attempt === MAX_WAIT_ITERATIONS - 1) {
            console.warn(
              `[execute-calls] call ${call.conversationId} still active after ` +
                `${MAX_WAIT_ITERATIONS} min — proceeding to next number; auto-sync will reconcile`
            );
          }
        }
        console.log(
          `[execute-calls] wait-loop end entry=${call.entryId} exit=${exitReason} elapsedMs=${Date.now() - waitStartMs}`
        );
      }

      // 10-15s buffer between batches. Deterministic pseudo-random based on
      // batchStart so we don't need a separate step to generate the value.
      const bufferSecs = 10 + (batchStart % 6);
      await step.sleep(`buffer-${batchStart}`, `${bufferSecs}s`);

      entriesProcessedThisRun += batch.length;
      const hasMoreWork = batchStart + botCount < entries.length;

      // Long rest break: after 2–2.5h of continuous calling, pause 10–15 min
      // before dialing the next batch. Keeps sustained dialing from getting
      // numbers spam-flagged / rate-limited by carriers.
      if (hasMoreWork) {
        const needRest = await step.run(
          `rest-check-${batchStart}`,
          async () => {
            const elapsedMs = Date.now() - sessionStartedAt;
            // 2h base + up to 30min, derived from the session clock (no RNG so
            // the decision is deterministic on Inngest replay).
            const thresholdMs =
              4 * 60 * 60 * 1000 + (sessionStartedAt % (30 * 60 * 1000));
            return elapsedMs >= thresholdMs;
          }
        );

        if (needRest) {
          // 10–15 min, derived deterministically from the session clock.
          const pauseSecs = 600 + (sessionStartedAt % 300);
          await step.sleep(`rest-break-${batchStart}`, `${pauseSecs}s`);
          // Reset the clock so the next 2–2.5h calling window starts fresh.
          sessionStartedAt = await step.run(
            `reset-clock-${batchStart}`,
            async () => Date.now()
          );
        }
      }

      // Chunk handoff: if we've processed enough entries and there are more to go,
      // spawn a fresh function run and exit. Each new run gets a fresh step budget.
      if (entriesProcessedThisRun >= MAX_ENTRIES_PER_RUN && hasMoreWork) {
        await step.run(`chunk-handoff-${batchStart}`, async () => {
          await inngest.send({
            name: "calllist/start",
            data: {
              callListId,
              agentId,
              botCredentialIds,
              // Forward the rest-break clock so it survives the fresh run.
              callingSessionStartedAt: sessionStartedAt,
            },
          });
        });
        return; // fresh run will continue from the remaining pending entries
      }
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
            // Extract SIP code from metadata.error ({code: 480, reason: "..."})
            // when available, else fall back to legacy string-based heuristics.
            const errObj = conv.metadata?.error;
            const sipCode =
              typeof errObj === "object" && errObj !== null
                ? errObj.code
                : null;

            const terminationReason =
              conv.metadata?.termination_reason ||
              conv.termination_reason ||
              conv.status;
            const isNoAnswer =
              isNoAnswerSipCode(sipCode) ||
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
