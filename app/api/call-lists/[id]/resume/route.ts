import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { start } from "workflow/api";
import { executeCallList } from "@/workflows/execute-call-list";
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

    // Start a fresh workflow run; the old run (if any) was cancelled on pause
    const run = await start(executeCallList, [
      id,
      list.agentId,
      list.botCredentialId ? [list.botCredentialId] : undefined,
    ]);

    await db
      .update(callLists)
      .set({ callStatus: "in_progress", workflowRunId: run.runId })
      .where(eq(callLists.id, id));

    return apiSuccess({ message: "Call list resumed", runId: run.runId });
  } catch (error) {
    return handleAuthError(error);
  }
}
