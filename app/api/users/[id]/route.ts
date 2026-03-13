import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["agent", "admin"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (user.role !== "admin" && user.role !== "it_admin") {
      return apiError("Forbidden", 403);
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid input", 422);
    }

    // Admin cannot promote to admin
    if (user.role === "admin" && parsed.data.role === "admin") {
      return apiError("Admins cannot promote users to admin role", 403);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.isActive !== undefined)
      updateData.isActive = parsed.data.isActive;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
      });

    if (!updated) return apiError("User not found", 404);
    return apiSuccess(updated);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (user.role !== "admin" && user.role !== "it_admin") {
      return apiError("Forbidden", 403);
    }

    const { id } = await params;

    const [updated] = await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });

    if (!updated) return apiError("User not found", 404);
    return apiSuccess({ message: "User deactivated" });
  } catch (error) {
    return handleAuthError(error);
  }
}
