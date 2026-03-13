import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { sendWelcomeEmail } from "@/lib/email";

const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["agent", "admin"]),
});

export async function GET() {
  try {
    const user = await requireAuth();
    // IT admin and admin can list users
    if (user.role !== "admin" && user.role !== "it_admin") {
      return apiError("Forbidden", 403);
    }

    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users);
    return apiSuccess(allUsers);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    // Role-based creation rules:
    // - it_admin can create admins and agents
    // - admin can create agents only
    if (user.role !== "admin" && user.role !== "it_admin") {
      return apiError("Forbidden", 403);
    }

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid input: " + parsed.error.message, 422);
    }

    const { email, name, password, role } = parsed.data;

    // Admin can only create agents, not other admins
    if (user.role === "admin" && role === "admin") {
      return apiError("Admins can only create agent accounts", 403);
    }

    // Check existing
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      return apiError("Email already exists", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [newUser] = await db
      .insert(users)
      .values({ email, name, passwordHash, role })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      });

    // Send welcome email with credentials
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`;
    const emailResult = await sendWelcomeEmail(email, name, password, role, loginUrl);

    return apiSuccess(
      {
        user: newUser,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
      },
      201
    );
  } catch (error) {
    return handleAuthError(error);
  }
}
