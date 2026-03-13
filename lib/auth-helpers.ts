import { NextResponse } from "next/server";
import { getSessionFromCookie, type SessionUser } from "./auth";

export async function getSession(): Promise<SessionUser | null> {
  return getSessionFromCookie();
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }
  return user;
}

export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new AuthError("Forbidden", 403);
  }
  return user;
}

export async function requireAgentAccess(agentId: string): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role === "admin" || user.role === "it_admin") return user;
  if (user.id !== agentId) {
    throw new AuthError("Forbidden", 403);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }
  console.error("Unexpected error:", error);
  return NextResponse.json(
    { success: false, error: "Internal server error" },
    { status: 500 }
  );
}
