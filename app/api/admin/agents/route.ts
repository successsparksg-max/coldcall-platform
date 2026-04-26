import { db } from "@/lib/db";
import {
  users,
  agentCredentials,
  agentBilling,
  callLists,
  callEntries,
  calls,
} from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess } from "@/lib/api-helpers";
import { eq, sql, gt, and, inArray } from "drizzle-orm";

export async function GET() {
  try {
    await requireRole("admin");

    // Get all agent users with aggregated stats
    const agents = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, "agent"));

    const agentStats = await Promise.all(
      agents.map(async (agent) => {
        // Billing
        const [billing] = await db
          .select()
          .from(agentBilling)
          .where(eq(agentBilling.agentId, agent.id))
          .limit(1);

        // Credentials — count active bots
        const allBots = await db
          .select({ credentialsComplete: agentCredentials.credentialsComplete })
          .from(agentCredentials)
          .where(eq(agentCredentials.agentId, agent.id));
        const activeBots = allBots.filter((b) => b.credentialsComplete);

        // Call stats
        const lists = await db
          .select()
          .from(callLists)
          .where(eq(callLists.agentId, agent.id));

        const totalLists = lists.length;
        const totalCalls = lists.reduce(
          (sum, l) => sum + (l.callsMade || 0),
          0
        );
        const callsAnswered = lists.reduce(
          (sum, l) => sum + (l.callsAnswered || 0),
          0
        );

        // Redialed calls: entries with at least one retry (call_attempts > 0)
        const listIds = lists.map((l) => l.id);
        const [redialStats] = listIds.length
          ? await db
              .select({
                redialedCalls: sql<number>`count(*)::int`,
              })
              .from(callEntries)
              .where(
                and(
                  inArray(callEntries.callListId, listIds),
                  gt(callEntries.callAttempts, 0)
                )
              )
          : [{ redialedCalls: 0 }];

        // Rating + bookings from calls table
        const [callStats] = await db
          .select({
            avgRating: sql<number>`avg(${calls.rating})`,
            appointmentsBooked: sql<number>`count(*) filter (where ${calls.bookingStatus} = 'TRUE')`,
          })
          .from(calls)
          .where(
            sql`${calls.callEntryId} IN (
              SELECT id FROM call_entries WHERE call_list_id IN (
                SELECT id FROM call_lists WHERE agent_id = ${agent.id}
              )
            )`
          );

        const lastList = lists.sort(
          (a, b) =>
            new Date(b.uploadedAt || 0).getTime() -
            new Date(a.uploadedAt || 0).getTime()
        )[0];

        return {
          ...agent,
          isPaid: billing?.isPaid || false,
          plan: billing?.plan || "basic",
          credentialsConfigured: activeBots.length > 0,
          botCount: activeBots.length,
          totalLists,
          totalCalls,
          callsAnswered,
          redialedCalls: Number(redialStats?.redialedCalls) || 0,
          avgRating: callStats?.avgRating
            ? Math.round(callStats.avgRating * 10) / 10
            : null,
          appointmentsBooked: callStats?.appointmentsBooked || 0,
          lastActive: lastList?.uploadedAt || null,
        };
      })
    );

    return apiSuccess(agentStats);
  } catch (error) {
    return handleAuthError(error);
  }
}
