import { db } from "@/lib/db";
import { callLists } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess } from "@/lib/api-helpers";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  try {
    const user = await requireAuth();

    const lists = await db
      .select()
      .from(callLists)
      .where(
        user.role === "admin"
          ? undefined
          : eq(callLists.agentId, user.id)
      )
      .orderBy(desc(callLists.uploadedAt));

    return apiSuccess(lists);
  } catch (error) {
    return handleAuthError(error);
  }
}
