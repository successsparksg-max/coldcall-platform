import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  callLists,
  callEntries,
  calls,
  agentCredentials,
  uploadValidations,
} from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq, and, asc, inArray } from "drizzle-orm";

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

    // Get bot label
    let botLabel: string | null = null;
    if (list.botCredentialId) {
      const [bot] = await db
        .select({ botLabel: agentCredentials.botLabel })
        .from(agentCredentials)
        .where(eq(agentCredentials.id, list.botCredentialId))
        .limit(1);
      botLabel = bot?.botLabel ?? null;
    }

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
          bookingLocation: calls.bookingLocation,
          bookingDate: calls.bookingDate,
          bookingTime: calls.bookingTime,
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

    // Deduplicate: if an entry has multiple calls records (from retries),
    // keep the one with analysis data, or the last one
    const entryMap = new Map<string, typeof entries[0]>();
    for (const e of entries) {
      const existing = entryMap.get(e.entry.id);
      if (!existing) {
        entryMap.set(e.entry.id, e);
      } else {
        // Prefer the row that has analysis data
        const hasAnalysis = e.analysis?.rating !== null || e.analysis?.summary !== null;
        const existingHasAnalysis = existing.analysis?.rating !== null || existing.analysis?.summary !== null;
        if (hasAnalysis && !existingHasAnalysis) {
          entryMap.set(e.entry.id, e);
        }
      }
    }

    const enrichedEntries = Array.from(entryMap.values()).map((e) => ({
      ...e.entry,
      analysis: e.analysis?.rating !== null || e.analysis?.summary !== null
        ? e.analysis
        : null,
    }));

    return apiSuccess({ list: { ...list, botLabel }, entries: enrichedEntries });
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

    // Delete calls first (FK from calls → call_entries has no cascade).
    const entryIds = await db
      .select({ id: callEntries.id })
      .from(callEntries)
      .where(eq(callEntries.callListId, id));
    if (entryIds.length > 0) {
      await db
        .delete(calls)
        .where(inArray(calls.callEntryId, entryIds.map((e) => e.id)));
    }

    // Unlink audit records so the FK constraint doesn't block deletion.
    // We keep the upload_validations rows themselves for historical tracking.
    await db
      .update(uploadValidations)
      .set({ callListId: null })
      .where(eq(uploadValidations.callListId, id));

    // call_entries cascades automatically from call_lists
    await db.delete(callLists).where(eq(callLists.id, id));
    return apiSuccess({ message: "Call list deleted" });
  } catch (error) {
    return handleAuthError(error);
  }
}
