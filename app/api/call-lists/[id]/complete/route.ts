import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq, and, inArray } from "drizzle-orm";

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
    if (list.callStatus !== "in_progress") {
      return apiError("Call list is not in progress", 400);
    }

    // Only auto-complete if no entries are still active
    const activeEntries = await db
      .select({ id: callEntries.id })
      .from(callEntries)
      .where(
        and(
          eq(callEntries.callListId, id),
          inArray(callEntries.callStatus, ["pending", "calling", "called"])
        )
      );

    if (activeEntries.length > 0) {
      return apiError("List still has active entries", 400);
    }

    await db
      .update(callLists)
      .set({ callStatus: "completed", completedAt: new Date() })
      .where(eq(callLists.id, id));

    return apiSuccess({ message: "Call list marked as completed" });
  } catch (error) {
    return handleAuthError(error);
  }
}
