import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";

export async function GET() {
  const user = await getSessionFromCookie();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }
  return NextResponse.json({ success: true, data: user });
}
