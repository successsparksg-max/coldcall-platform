import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries, calls } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq, and, asc } from "drizzle-orm";

export async function GET(
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

    // Get entries with analysis data
    const entries = await db
      .select({
        entry: callEntries,
        analysis: {
          rating: calls.rating,
          summary: calls.summary,
          email: calls.email,
          name: calls.name,
          bookingStatus: calls.bookingStatus,
          estimatedCost: calls.estimatedCost,
          transcript: calls.transcript,
          recordingUrl: calls.recordingUrl,
          duration: calls.duration,
          callCost: calls.callCost,
        },
      })
      .from(callEntries)
      .leftJoin(calls, eq(callEntries.id, calls.callEntryId))
      .where(eq(callEntries.callListId, id))
      .orderBy(asc(callEntries.sortOrder));

    const enrichedEntries = entries.map((e) => ({
      ...e.entry,
      analysis: e.analysis?.rating !== null || e.analysis?.summary !== null
        ? e.analysis
        : null,
    }));

    return apiSuccess({ list, entries: enrichedEntries });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
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
      return apiError("Cannot delete a list that is in progress", 400);
    }

    await db.delete(callLists).where(eq(callLists.id, id));
    return apiSuccess({ message: "Call list deleted" });
  } catch (error) {
    return handleAuthError(error);
  }
}
