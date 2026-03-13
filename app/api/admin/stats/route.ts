import { db } from "@/lib/db";
import { users, callLists, calls, uploadValidations } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess } from "@/lib/api-helpers";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    await requireRole("admin");

    const [agentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, "agent"));

    const [listStats] = await db
      .select({
        totalLists: sql<number>`count(*)`,
        totalCalls: sql<number>`coalesce(sum(${callLists.callsMade}), 0)`,
        totalAnswered: sql<number>`coalesce(sum(${callLists.callsAnswered}), 0)`,
      })
      .from(callLists);

    const [callAnalysis] = await db
      .select({
        avgRating: sql<number>`avg(${calls.rating})`,
        totalBooked: sql<number>`count(*) filter (where ${calls.bookingStatus} = 'TRUE')`,
      })
      .from(calls);

    // Hot leads: rating >= 4 and booked
    const hotLeads = await db
      .select({
        id: calls.id,
        name: calls.name,
        email: calls.email,
        phoneNumber: calls.phoneNumber,
        rating: calls.rating,
        summary: calls.summary,
        bookingStatus: calls.bookingStatus,
        createdAt: calls.createdAt,
      })
      .from(calls)
      .where(
        sql`${calls.rating} >= 4 AND ${calls.bookingStatus} = 'TRUE'`
      )
      .orderBy(sql`${calls.createdAt} DESC`)
      .limit(20);

    // Upload quality
    const [uploadQuality] = await db
      .select({
        totalUploads: sql<number>`count(*)`,
        passedUploads: sql<number>`count(*) filter (where ${uploadValidations.validationPassed} = true)`,
      })
      .from(uploadValidations);

    return apiSuccess({
      totalAgents: agentCount?.count || 0,
      totalLists: listStats?.totalLists || 0,
      totalCalls: listStats?.totalCalls || 0,
      totalAnswered: listStats?.totalAnswered || 0,
      avgRating: callAnalysis?.avgRating
        ? Math.round(callAnalysis.avgRating * 10) / 10
        : null,
      totalBooked: callAnalysis?.totalBooked || 0,
      hotLeads,
      uploadQuality: {
        total: uploadQuality?.totalUploads || 0,
        passed: uploadQuality?.passedUploads || 0,
        rate: uploadQuality?.totalUploads
          ? Math.round(
              ((uploadQuality.passedUploads || 0) / uploadQuality.totalUploads) *
                100
            )
          : 0,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
