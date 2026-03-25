import { db } from "@/lib/db";
import { agentCredentials } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess } from "@/lib/api-helpers";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const user = await requireAuth();

    const bots = await db
      .select({
        id: agentCredentials.id,
        botLabel: agentCredentials.botLabel,
      })
      .from(agentCredentials)
      .where(
        and(
          eq(agentCredentials.agentId, user.id),
          eq(agentCredentials.credentialsComplete, true)
        )
      );

    return apiSuccess(bots);
  } catch (error) {
    return handleAuthError(error);
  }
}
