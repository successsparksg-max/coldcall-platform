import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, callEntries } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq, and } from "drizzle-orm";

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
    if (
      list.callStatus !== "in_progress" &&
      list.callStatus !== "paused"
    ) {
      return apiError("Call list cannot be cancelled", 400);
    }

    // Mark remaining pending entries as skipped
    await db
      .update(callEntries)
      .set({ callStatus: "skipped", updatedAt: new Date() })
      .where(
        and(
          eq(callEntries.callListId, id),
          eq(callEntries.callStatus, "pending")
        )
      );

    await db
      .update(callLists)
      .set({ callStatus: "cancelled", completedAt: new Date() })
      .where(eq(callLists.id, id));

    return apiSuccess({ message: "Call list cancelled" });
  } catch (error) {
    return handleAuthError(error);
  }
}
