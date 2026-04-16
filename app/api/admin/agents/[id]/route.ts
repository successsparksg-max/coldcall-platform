import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, callLists, callEntries, calls, agentBilling } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq, desc, inArray, sql } from "drizzle-orm";

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

    const listsRaw = await db
      .select()
      .from(callLists)
      .where(eq(callLists.agentId, id))
      .orderBy(desc(callLists.uploadedAt));

    // Count bookings per list
    const listIds = listsRaw.map((l) => l.id);
    const bookingMap = new Map<string, number>();
    if (listIds.length > 0) {
      const bookingCounts = await db
        .select({
          callListId: callEntries.callListId,
          booked: sql<number>`count(*) filter (where ${calls.bookingStatus} = 'TRUE')`,
        })
        .from(callEntries)
        .innerJoin(calls, eq(calls.callEntryId, callEntries.id))
        .where(inArray(callEntries.callListId, listIds))
        .groupBy(callEntries.callListId);
      for (const b of bookingCounts) {
        bookingMap.set(b.callListId, Number(b.booked));
      }
    }
    const lists = listsRaw.map((l) => ({ ...l, booked: bookingMap.get(l.id) || 0 }));

    return apiSuccess({ agent, billing, lists });
  } catch (error) {
    return handleAuthError(error);
  }
}
