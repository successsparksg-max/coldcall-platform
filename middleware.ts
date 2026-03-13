import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "session_token";

function getJwtSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function getUser(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const secret = getJwtSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return { role: payload.role as string };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const user = await getUser(req);

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ["/dashboard", "/admin", "/it-admin"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Protected API routes - return 401 if not authenticated
  const protectedApiPaths = [
    "/api/users",
    "/api/credentials",
    "/api/call-lists",
    "/api/admin",
    "/api/template",
  ];
  const isProtectedApi = protectedApiPaths.some((p) => pathname.startsWith(p));

  if (isProtectedApi && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role-based page access
  if (user) {
    if (pathname.startsWith("/admin") && user.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    if (
      pathname.startsWith("/it-admin") &&
      user.role !== "it_admin" &&
      user.role !== "admin"
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Role-based API access
    if (pathname.startsWith("/api/admin") && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/it-admin/:path*",
    "/api/users/:path*",
    "/api/credentials/:path*",
    "/api/call-lists/:path*",
    "/api/admin/:path*",
    "/api/template/:path*",
  ],
};
