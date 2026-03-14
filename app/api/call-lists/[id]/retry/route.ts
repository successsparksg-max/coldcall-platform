import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq, and, inArray, sql } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

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

    if (list.callStatus === "in_progress") {
      return apiError("Cannot retry while list is in progress", 400);
    }

    // Find entries that can be retried
    const retryableStatuses = ["no_answer", "busy", "failed"] as const;
    const retryEntries = await db
      .select({ id: callEntries.id })
      .from(callEntries)
      .where(
        and(
          eq(callEntries.callListId, id),
          inArray(callEntries.callStatus, [...retryableStatuses])
        )
      );

    if (retryEntries.length === 0) {
      return apiSuccess({
        reset: 0,
        message: "No calls to retry",
      });
    }

    // Reset entries to pending
    await db
      .update(callEntries)
      .set({
        callStatus: "pending",
        conversationId: null,
        telephonyCallSid: null,
        callDurationSeconds: null,
        callStartedAt: null,
        callEndedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(callEntries.callListId, id),
          inArray(callEntries.callStatus, [...retryableStatuses])
        )
      );

    // Reset list counters for retried calls and set status to ready
    await db
      .update(callLists)
      .set({
        callStatus: "ready",
        callsNoAnswer: sql`GREATEST(0, ${callLists.callsNoAnswer} - ${retryEntries.length})`,
        callsFailed: 0,
        callsMade: sql`GREATEST(0, ${callLists.callsMade} - ${retryEntries.length})`,
        completedAt: null,
      })
      .where(eq(callLists.id, id));

    return apiSuccess({
      reset: retryEntries.length,
      message: `${retryEntries.length} call${retryEntries.length !== 1 ? "s" : ""} reset to pending. Press Start to call them.`,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
