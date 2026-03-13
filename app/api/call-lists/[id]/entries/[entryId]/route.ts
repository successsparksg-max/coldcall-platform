import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq, and, sql } from "drizzle-orm";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const user = await requireAuth();
    const { id, entryId } = await params;

    // Verify the call list belongs to this agent (or admin)
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

    // Only allow removal when list is not actively calling
    if (list.callStatus === "in_progress") {
      return apiError("Cannot remove entries while calls are in progress. Pause the list first.", 400);
    }

    // Verify the entry exists and belongs to this list
    const [entry] = await db
      .select()
      .from(callEntries)
      .where(
        and(
          eq(callEntries.id, entryId),
          eq(callEntries.callListId, id)
        )
      )
      .limit(1);

    if (!entry) return apiError("Entry not found", 404);

    // Only allow removal of pending/skipped entries (not already called)
    if (!["pending", "skipped"].includes(entry.callStatus)) {
      return apiError(
        "Can only remove entries that haven't been called yet",
        400
      );
    }

    // Delete the entry
    await db.delete(callEntries).where(eq(callEntries.id, entryId));

    // Update the call list total count
    await db
      .update(callLists)
      .set({
        totalNumbers: sql`${callLists.totalNumbers} - 1`,
      })
      .where(eq(callLists.id, id));

    return apiSuccess({ message: "Entry removed" });
  } catch (error) {
    return handleAuthError(error);
  }
}
