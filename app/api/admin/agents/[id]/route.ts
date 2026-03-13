import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, callLists, agentBilling } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("admin");
    const { id } = await params;

    const [agent] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isActive: users.isActive,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!agent) return apiError("Agent not found", 404);

    const [billing] = await db
      .select()
      .from(agentBilling)
      .where(eq(agentBilling.agentId, id))
      .limit(1);

    const lists = await db
      .select()
      .from(callLists)
      .where(eq(callLists.agentId, id))
      .orderBy(desc(callLists.uploadedAt));

    return apiSuccess({ agent, billing, lists });
  } catch (error) {
    return handleAuthError(error);
  }
}
