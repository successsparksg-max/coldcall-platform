import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries, calls, agentCredentials } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";
import { inngest } from "@/lib/inngest/client";
import { eq, and, isNull } from "drizzle-orm";

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

    // Get agent's credentials
    const [creds] = await db
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.agentId, list.agentId))
      .limit(1);

    if (!creds) {
      return apiError("Agent credentials not configured", 400);
    }

    const apiKey = decrypt(creds.elevenlabsApiKey);

    // Find answered entries that have no analysis (rating is null)
    const answeredEntries = await db
      .select({
        entry: callEntries,
        callRecord: calls,
      })
      .from(callEntries)
      .innerJoin(calls, eq(callEntries.id, calls.callEntryId))
      .where(
        and(
          eq(callEntries.callListId, id),
          eq(callEntries.callStatus, "answered"),
          isNull(calls.rating)
        )
      );

    if (answeredEntries.length === 0) {
      return apiSuccess({
        analyzed: 0,
        message: "No calls need re-analysis",
      });
    }

    let triggered = 0;

    for (const { entry, callRecord } of answeredEntries) {
      const conversationId =
        entry.conversationId || callRecord.conversationId;
      if (!conversationId) continue;

      // If we already have a transcript stored, use it
      let transcriptText = callRecord.transcript;

      // Otherwise fetch from ElevenLabs
      if (!transcriptText) {
        try {
          const res = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
            { headers: { "xi-api-key": apiKey } }
          );

          if (res.ok) {
            const conv = await res.json();
            if (conv.transcript && Array.isArray(conv.transcript)) {
              transcriptText = conv.transcript
                .filter(
                  (e: { role?: string; message?: string }) =>
                    e.role && e.message
                )
                .map(
                  (e: { role: string; message: string }) =>
                    `${e.role}: ${e.message}`
                )
                .join("\n");
            }
          }
        } catch {
          // Skip this entry if fetch fails
          continue;
        }
      }

      if (!transcriptText || transcriptText.length === 0) continue;

      await inngest.send({
        name: "call/analyze-transcript",
        data: {
          conversationId,
          transcriptText,
          callDurationSecs: entry.callDurationSeconds || callRecord.duration || 0,
          cost: Number(callRecord.callCost) || 0,
          recordingUrl:
            callRecord.recordingUrl ||
            `https://elevenlabs.io/app/conversational-ai/history/${conversationId}`,
        },
      });

      triggered++;
    }

    return apiSuccess({
      analyzed: triggered,
      total: answeredEntries.length,
      message: `Re-analysis triggered for ${triggered} call${triggered !== 1 ? "s" : ""}. Results will appear shortly.`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
