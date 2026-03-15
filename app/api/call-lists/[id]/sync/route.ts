import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries, calls, agentCredentials } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { inngest } from "@/lib/inngest/client";
import { eq, and, inArray } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    // Get the call list
    const conditions =
      user.role === "admin"
        ? eq(callLists.id, id)
        : and(eq(callLists.id, id), eq(callLists.agentId, user.id));

    const [list] = await db
      .select()
      .from(callLists)
      .where(conditions)
      .limit(1);

    if (!list) return apiError("Call list not found", 404);

    // Get agent's credentials (need API key to fetch from ElevenLabs)
    const [creds] = await db
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.agentId, list.agentId))
      .limit(1);

    if (!creds) {
      return apiError("Agent credentials not configured", 400);
    }

    const apiKey = decrypt(creds.elevenlabsApiKey);

    // Find entries with status "called" (webhook never received)
    const staleEntries = await db
      .select()
      .from(callEntries)
      .where(
        and(
          eq(callEntries.callListId, id),
          inArray(callEntries.callStatus, ["called", "calling"])
        )
      );

    if (staleEntries.length === 0) {
      return apiSuccess({ synced: 0, message: "No calls to sync" });
    }

    const results: {
      entryId: string;
      conversationId: string | null;
      status: string;
      error?: string;
    }[] = [];

    for (const entry of staleEntries) {
      if (!entry.conversationId) {
        results.push({
          entryId: entry.id,
          conversationId: null,
          status: "skipped",
          error: "No conversation ID",
        });
        continue;
      }

      try {
        // Fetch conversation data from ElevenLabs
        const res = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${entry.conversationId}`,
          {
            headers: { "xi-api-key": apiKey },
          }
        );

        if (!res.ok) {
          results.push({
            entryId: entry.id,
            conversationId: entry.conversationId,
            status: "error",
            error: `ElevenLabs API returned ${res.status}`,
          });
          continue;
        }

        const conv = await res.json();
        const status = conv.status;
        const durationSecs =
          conv.metadata?.call_duration_secs ||
          conv.metadata?.duration_secs ||
          0;
        const cost = conv.metadata?.cost || conv.call_cost || 0;

        // Determine call status
        let newEntryStatus: "answered" | "no_answer" | "failed";
        if (status === "done") {
          newEntryStatus = "answered";
        } else {
          // Check if it's a no-answer vs actual failure
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

        // Update call_entries
        await db
          .update(callEntries)
          .set({
            callStatus: newEntryStatus,
            callDurationSeconds: durationSecs,
            callEndedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(callEntries.id, entry.id));

        // Update calls table
        await db
          .update(calls)
          .set({
            numberStatus: "idle",
            duration: durationSecs,
            callCost: cost?.toString() || null,
          })
          .where(eq(calls.conversationId, entry.conversationId));

        // Update call list counters
        if (newEntryStatus === "answered") {
          await db.execute(
            `UPDATE call_lists SET calls_answered = calls_answered + 1 WHERE id = '${list.id}'`
          );
        } else if (newEntryStatus === "no_answer") {
          await db.execute(
            `UPDATE call_lists SET calls_no_answer = calls_no_answer + 1 WHERE id = '${list.id}'`
          );
        } else {
          await db.execute(
            `UPDATE call_lists SET calls_failed = calls_failed + 1 WHERE id = '${list.id}'`
          );
        }

        // Trigger transcript analysis if conversation completed
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

        results.push({
          entryId: entry.id,
          conversationId: entry.conversationId,
          status: "synced",
        });
      } catch (err) {
        results.push({
          entryId: entry.id,
          conversationId: entry.conversationId,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const synced = results.filter((r) => r.status === "synced").length;

    return apiSuccess({
      synced,
      total: staleEntries.length,
      results,
      message: `Synced ${synced} of ${staleEntries.length} calls. Transcript analysis triggered.`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
