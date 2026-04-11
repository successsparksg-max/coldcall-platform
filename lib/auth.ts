import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "session_token";
const JWT_EXPIRY = "24h";

function getJwtSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET not set");
  return new TextEncoder().encode(secret);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

// ---------- IT Admin (fixed user from env) ----------

function getItAdminCredentials() {
  return {
    username: process.env.IT_ADMIN_USERNAME || "it-admin",
    password: process.env.IT_ADMIN_PASSWORD || "",
  };
}

function isItAdminLogin(email: string, password: string): boolean {
  const creds = getItAdminCredentials();
  return email === creds.username && password === creds.password && creds.password !== "";
}

function getItAdminUser(): SessionUser {
  return {
    id: "it-admin",
    email: process.env.IT_ADMIN_USERNAME || "it-admin",
    name: "IT Admin",
    role: "it_admin",
  };
}

// ---------- JWT ----------

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      id: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

// ---------- Cookie helpers ----------

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionFromCookie(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// ---------- Login ----------

export async function authenticate(
  email: string,
  password: string
): Promise<{ user: SessionUser } | { error: string }> {
  // Check IT admin first
  if (isItAdminLogin(email, password)) {
    return { user: getItAdminUser() };
  }

  // Check database users
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !user.passwordHash) {
    return { error: "No account found with this email" };
  }

  if (!user.isActive) {
    return { error: "This account has been deactivated" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: "Incorrect password" };
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}
