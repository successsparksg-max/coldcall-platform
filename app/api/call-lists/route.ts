import { db } from "@/lib/db";
import { callLists, users } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess } from "@/lib/api-helpers";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  try {
    const user = await requireAuth();

    if (user.role === "admin") {
      // Admin sees all lists with agent info
      const lists = await db
        .select({
          id: callLists.id,
          agentId: callLists.agentId,
          originalFilename: callLists.originalFilename,
          fileHash: callLists.fileHash,
          uploadedAt: callLists.uploadedAt,
          parseStatus: callLists.parseStatus,
          validationErrors: callLists.validationErrors,
          callStatus: callLists.callStatus,
          totalNumbers: callLists.totalNumbers,
          callsMade: callLists.callsMade,
          callsAnswered: callLists.callsAnswered,
          callsNoAnswer: callLists.callsNoAnswer,
          callsFailed: callLists.callsFailed,
          startedAt: callLists.startedAt,
          completedAt: callLists.completedAt,
          agentName: users.name,
          agentEmail: users.email,
        })
        .from(callLists)
        .leftJoin(users, eq(callLists.agentId, users.id))
        .orderBy(desc(callLists.uploadedAt));

      return apiSuccess(lists);
    }

    // Agent sees only their own lists
    const lists = await db
      .select()
      .from(callLists)
      .where(eq(callLists.agentId, user.id))
      .orderBy(desc(callLists.uploadedAt));

    return apiSuccess(lists);
  } catch (error) {
    return handleAuthError(error);
  }
}
