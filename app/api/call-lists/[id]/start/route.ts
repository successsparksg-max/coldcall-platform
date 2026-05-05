import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { callLists, agentCredentials } from "@/lib/schema";
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
    if (list.callStatus !== "ready") {
      return apiError("Call list is not in ready state", 400);
    }

    // Use the assigned bot, or fall back to first available
    let botId = list.botCredentialId;
    if (!botId) {
      const [firstBot] = await db
        .select({ id: agentCredentials.id })
        .from(agentCredentials)
        .where(
          and(
            eq(agentCredentials.agentId, list.agentId),
            eq(agentCredentials.credentialsComplete, true)
          )
        )
        .limit(1);
      botId = firstBot?.id || null;
    }

    if (!botId) {
      return apiError("No agent bot configured for this list", 400);
    }

    // Verify the bot credential exists and is complete
    const [bot] = await db
      .select()
      .from(agentCredentials)
      .where(
        and(
          eq(agentCredentials.id, botId),
          eq(agentCredentials.credentialsComplete, true)
        )
      )
      .limit(1);

    if (!bot) {
      return apiError("Assigned bot credentials not found or incomplete", 400);
    }

    // Update status
    await db
      .update(callLists)
      .set({ callStatus: "in_progress", startedAt: new Date() })
      .where(eq(callLists.id, id));

    // Trigger Inngest with the single assigned bot
    await inngest.send({
      name: "calllist/start",
      data: {
        callListId: id,
        agentId: list.agentId,
        botCredentialIds: [bot.id],
      },
    });

    return apiSuccess({ message: "Call list started" });
  } catch (error) {
    return handleAuthError(error);
  }
}
