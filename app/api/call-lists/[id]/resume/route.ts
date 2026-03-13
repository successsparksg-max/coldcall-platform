import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { inngest } from "@/lib/inngest/client";
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
    if (list.callStatus !== "paused") {
      return apiError("Call list is not paused", 400);
    }

    await db
      .update(callLists)
      .set({ callStatus: "in_progress" })
      .where(eq(callLists.id, id));

    // Re-trigger Inngest for remaining entries
    await inngest.send({
      name: "calllist/start",
      data: { callListId: id, agentId: list.agentId },
    });

    return apiSuccess({ message: "Call list resumed" });
  } catch (error) {
    return handleAuthError(error);
  }
}
