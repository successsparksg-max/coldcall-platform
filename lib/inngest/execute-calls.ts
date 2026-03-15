import { inngest } from "./client";
import { db } from "@/lib/db";
import { callLists, callEntries, calls, agentCredentials } from "@/lib/schema";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { initiateOutboundCall } from "@/lib/elevenlabs";

export const executeCallList = inngest.createFunction(
  { id: "execute-call-list", retries: 0 },
  { event: "calllist/start" },
  async ({ event, step }) => {
    const { callListId, agentId } = event.data;

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

    const credentials = await step.run("fetch-credentials", async () => {
      const [cred] = await db
        .select()
        .from(agentCredentials)
        .where(eq(agentCredentials.agentId, agentId))
        .limit(1);

      if (!cred) throw new Error("No credentials found for agent");

      return {
        elevenlabs_api_key: decrypt(cred.elevenlabsApiKey),
        elevenlabs_agent_id: cred.elevenlabsAgentId,
        telephony_provider: cred.telephonyProvider as "twilio" | "didww",
        elevenlabs_phone_number_id: cred.elevenlabsPhoneNumberId,
        didww_phone_number: cred.didwwPhoneNumber,
        outbound_caller_id: cred.outboundCallerId,
      };
    });

    for (const entry of entries) {
      // Check if we should continue
      const shouldContinue = await step.run(
        `check-${entry.id}`,
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

      // Place call
      try {
        await step.run(`place-call-${entry.id}`, async () => {
          // Mark as calling
          await db
            .update(callEntries)
            .set({ callStatus: "calling", callStartedAt: new Date(), updatedAt: new Date() })
            .where(eq(callEntries.id, entry.id));

          const result = await initiateOutboundCall(
            credentials,
            entry.phoneNumber
          );

          // Mark as called
          await db
            .update(callEntries)
            .set({
              conversationId: result.conversation_id,
              telephonyCallSid: result.callSid || null,
              callStatus: "called",
              updatedAt: new Date(),
            })
            .where(eq(callEntries.id, entry.id));

          // Create call record
          await db.insert(calls).values({
            callEntryId: entry.id,
            conversationId: result.conversation_id,
            callId: result.callSid || null,
            callingNumber: credentials.outbound_caller_id,
            phoneNumber: entry.phoneNumber,
            numberStatus: "busy",
            elevenlabsAgentId: credentials.elevenlabs_agent_id,
          });

          // Increment calls_made
          await db
            .update(callLists)
            .set({
              callsMade: sql`${callLists.callsMade} + 1`,
            })
            .where(eq(callLists.id, callListId));

          return result;
        });

        // Wait for webhook or timeout
        await step.waitForEvent(`wait-${entry.id}`, {
          event: "elevenlabs/call-completed",
          match: "data.conversation_id",
          timeout: "5m",
        });
      } catch {
        // Mark entry as failed
        await step.run(`fail-${entry.id}`, async () => {
          await db
            .update(callEntries)
            .set({ callStatus: "failed", updatedAt: new Date() })
            .where(eq(callEntries.id, entry.id));

          await db
            .update(callLists)
            .set({
              callsFailed: sql`${callLists.callsFailed} + 1`,
            })
            .where(eq(callLists.id, callListId));
        });
      }

      // Buffer between calls
      await step.sleep(`buffer-${entry.id}`, "10s");
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

      const apiKey = credentials.elevenlabs_api_key;

      for (const entry of staleEntries) {
        if (!entry.conversationId) continue;

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

          // Update list counters
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

          // Trigger analysis for answered calls
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
