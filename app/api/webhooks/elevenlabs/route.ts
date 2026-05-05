import { NextRequest, NextResponse } from "next/server";
import { db, withRetry } from "@/lib/db";
import { callEntries, calls, callLists, agentCredentials } from "@/lib/schema";
import { inngest } from "@/lib/inngest/client";
import { decrypt } from "@/lib/encryption";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  agentId: string
): Promise<boolean> {
  if (!signature) return true; // No signature header = skip verification

  try {
    const [cred] = await db
      .select({ elevenlabsWebhookSecret: agentCredentials.elevenlabsWebhookSecret })
      .from(agentCredentials)
      .where(eq(agentCredentials.elevenlabsAgentId, agentId))
      .limit(1);

    if (!cred?.elevenlabsWebhookSecret) return true; // No secret configured = skip

    const secret = decrypt(cred.elevenlabsWebhookSecret);
    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    console.error("[webhook] Signature verification error");
    return true; // Don't block webhooks if verification fails
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    const data = payload.data || payload.body?.data;
    if (!data) return NextResponse.json({ ok: true });

    const conversationId = data.conversation_id;
    const status = data.status;

    // Verify HMAC signature if present
    const signature =
      req.headers.get("x-elevenlabs-signature") ||
      req.headers.get("x-signature");
    if (data.agent_id && signature) {
      const valid = await verifyWebhookSignature(rawBody, signature, data.agent_id);
      if (!valid) {
        console.warn("[webhook] HMAC signature mismatch for conversation:", conversationId, "— processing anyway");
      }
    }

    if (!conversationId) return NextResponse.json({ ok: true });

    // 1. Update call_entries status
    const newEntryStatus = status === "done" ? "answered" : "failed";
    const durationSecs = data.metadata?.call_duration_secs || 0;

    await withRetry(
      () =>
        db
          .update(callEntries)
          .set({
            callStatus: newEntryStatus,
            callDurationSeconds: durationSecs,
            callEndedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(callEntries.conversationId, conversationId)),
      { label: "webhook-update-entry" }
    );

    // 2. Update calls table
    await withRetry(
      () =>
        db
          .update(calls)
          .set({
            numberStatus: "idle",
            duration: durationSecs,
            callCost: data.metadata?.cost?.toString() || null,
          })
          .where(eq(calls.conversationId, conversationId)),
      { label: "webhook-update-call" }
    );

    // 3. Update call list counters - find the list from entry
    const [entry] = await withRetry(
      () =>
        db
          .select({ callListId: callEntries.callListId })
          .from(callEntries)
          .where(eq(callEntries.conversationId, conversationId))
          .limit(1),
      { label: "webhook-find-entry" }
    );

    if (entry) {
      if (newEntryStatus === "answered") {
        await db
          .update(callLists)
          .set({
            callsAnswered: sql`${callLists.callsAnswered} + 1`,
          })
          .where(eq(callLists.id, entry.callListId));
      } else if (newEntryStatus === "failed") {
        // Check if it was actually a no-answer vs failed
        const isNoAnswer =
          data.metadata?.termination_reason === "no_answer" ||
          durationSecs < 5;
        if (isNoAnswer) {
          await db
            .update(callEntries)
            .set({ callStatus: "no_answer" })
            .where(eq(callEntries.conversationId, conversationId));
          await db
            .update(callLists)
            .set({
              callsNoAnswer: sql`${callLists.callsNoAnswer} + 1`,
            })
            .where(eq(callLists.id, entry.callListId));
        } else {
          await db
            .update(callLists)
            .set({
              callsFailed: sql`${callLists.callsFailed} + 1`,
            })
            .where(eq(callLists.id, entry.callListId));
        }
      }
    }

    // 4. If call completed, trigger post-call analysis
    console.log(`[webhook] conversationId=${conversationId} status=${status} hasTranscript=${!!data.transcript}`);

    if (status === "done" && data.transcript) {
      const transcriptText = data.transcript
        .filter(
          (e: { role?: string; message?: string }) => e.role && e.message
        )
        .map((e: { role: string; message: string }) => `${e.role}: ${e.message}`)
        .join("\n");

      console.log(`[webhook] Sending analyze-transcript event, transcript length: ${transcriptText.length}`);

      try {
        await withRetry(
          () =>
            inngest.send({
              name: "call/analyze-transcript",
              data: {
                conversationId,
                transcriptText,
                callDurationSecs: durationSecs,
                cost: data.metadata?.cost || 0,
                recordingUrl: `https://elevenlabs.io/app/conversational-ai/history/${conversationId}`,
              },
            }),
          { retries: 2, label: "webhook-send-analyze" }
        );
        console.log("[webhook] analyze-transcript event sent successfully");
      } catch (inngestErr) {
        console.error("[webhook] Failed to send analyze-transcript event:", inngestErr);
      }
    } else {
      console.log(`[webhook] Skipping analysis: status=${status}, hasTranscript=${!!data.transcript}`);
    }

    // 5. Unblock the call execution loop
    try {
      await withRetry(
        () =>
          inngest.send({
            name: "elevenlabs/call-completed",
            data: { conversation_id: conversationId },
          }),
        { retries: 2, label: "webhook-send-completed" }
      );
      console.log("[webhook] call-completed event sent");
    } catch (inngestErr) {
      console.error("[webhook] Failed to send call-completed event:", inngestErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhook] Webhook handler error:", error);
    return NextResponse.json({ ok: true }); // Always 200 to avoid retries
  }
}
