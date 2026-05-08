import { db, withRetry } from "@/lib/db";
import { agentCredentials } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess } from "@/lib/api-helpers";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const user = await requireAuth();

    const bots = await withRetry(
      () =>
        db
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
          ),
      { label: "my-bots-list" }
    );

    return apiSuccess(bots);
  } catch (error) {
    return handleAuthError(error);
  }
}
