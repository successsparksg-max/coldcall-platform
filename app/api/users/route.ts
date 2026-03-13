import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireRole, handleAuthError } from "@/lib/auth-helpers";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["agent", "admin", "it_admin"]),
});

export async function GET() {
  try {
    await requireRole("admin");
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
    await requireRole("admin");
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid input: " + parsed.error.message, 422);
    }

    const { email, name, password, role } = parsed.data;

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

    return apiSuccess(newUser, 201);
  } catch (error) {
    return handleAuthError(error);
  }
}
