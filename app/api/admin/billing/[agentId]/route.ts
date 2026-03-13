import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { agentBilling } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const billingUpdateSchema = z.object({
  plan: z.string().optional(),
  isPaid: z.boolean().optional(),
  billingCycleStart: z.string().optional(),
  billingCycleEnd: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    await requireRole("admin");
    const { agentId } = await params;

    const [billing] = await db
      .select()
      .from(agentBilling)
      .where(eq(agentBilling.agentId, agentId))
      .limit(1);

    return apiSuccess(billing || null);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    await requireRole("admin");
    const { agentId } = await params;
    const body = await req.json();
    const parsed = billingUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid input", 422);
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.plan !== undefined) updateData.plan = data.plan;
    if (data.isPaid !== undefined) updateData.isPaid = data.isPaid;
    if (data.billingCycleStart !== undefined)
      updateData.billingCycleStart = data.billingCycleStart;
    if (data.billingCycleEnd !== undefined)
      updateData.billingCycleEnd = data.billingCycleEnd;
    if (data.notes !== undefined) updateData.notes = data.notes;

    // Upsert
    const existing = await db
      .select({ id: agentBilling.id })
      .from(agentBilling)
      .where(eq(agentBilling.agentId, agentId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(agentBilling)
        .set(updateData)
        .where(eq(agentBilling.agentId, agentId));
    } else {
      await db
        .insert(agentBilling)
        .values({ agentId, ...updateData } as typeof agentBilling.$inferInsert);
    }

    return apiSuccess({ message: "Billing updated" });
  } catch (error) {
    return handleAuthError(error);
  }
}
