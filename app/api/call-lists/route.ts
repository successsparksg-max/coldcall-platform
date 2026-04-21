import { db } from "@/lib/db";
import { callLists, callEntries, calls, users } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess } from "@/lib/api-helpers";
import { eq, desc, inArray, sql } from "drizzle-orm";

async function bookedCountsFor(listIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (listIds.length === 0) return map;
  const rows = await db
    .select({
      callListId: callEntries.callListId,
      booked: sql<number>`count(*) filter (where ${calls.bookingStatus} = 'TRUE')`,
    })
    .from(callEntries)
    .innerJoin(calls, eq(calls.callEntryId, callEntries.id))
    .where(inArray(callEntries.callListId, listIds))
    .groupBy(callEntries.callListId);
  for (const r of rows) map.set(r.callListId, Number(r.booked));
  return map;
}

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

      const booked = await bookedCountsFor(lists.map((l) => l.id));
      const enriched = lists.map((l) => ({ ...l, booked: booked.get(l.id) || 0 }));

      return apiSuccess(enriched);
    }

    // Agent sees only their own lists
    const lists = await db
      .select()
      .from(callLists)
      .where(eq(callLists.agentId, user.id))
      .orderBy(desc(callLists.uploadedAt));

    const booked = await bookedCountsFor(lists.map((l) => l.id));
    const enriched = lists.map((l) => ({ ...l, booked: booked.get(l.id) || 0 }));

    return apiSuccess(enriched);
  } catch (error) {
    return handleAuthError(error);
  }
}
