import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    // IT admin (fixed user) cannot change password via API
    if (user.id === "it-admin") {
      return NextResponse.json(
        { success: false, error: "IT admin password is managed via environment variables" },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: "Current and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Verify current password
    const [dbUser] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!dbUser?.passwordHash) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Update password
    const newHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      data: { message: "Password changed successfully" },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
