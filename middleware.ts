import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Admin routes
    if (pathname.startsWith("/admin")) {
      if (token?.role !== "admin") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    // IT Admin routes
    if (pathname.startsWith("/it-admin")) {
      if (token?.role !== "it_admin" && token?.role !== "admin") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    // Dashboard routes - all authenticated users
    if (pathname.startsWith("/dashboard")) {
      // OK for all roles
    }

    // API admin routes
    if (pathname.startsWith("/api/admin")) {
      if (token?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

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
