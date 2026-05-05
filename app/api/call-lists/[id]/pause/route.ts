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
    if (list.callStatus !== "in_progress") {
      return apiError("Call list is not in progress", 400);
    }

    await db
      .update(callLists)
      .set({ callStatus: "paused" })
      .where(eq(callLists.id, id));

    // Cancel the running Inngest function so Resume can start a clean one
    await inngest.send({
      name: "calllist/cancel",
      data: { callListId: id },
    });

    return apiSuccess({ message: "Call list paused" });
  } catch (error) {
    return handleAuthError(error);
  }
}
