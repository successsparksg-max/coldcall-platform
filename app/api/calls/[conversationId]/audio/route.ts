import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calls, callEntries, callLists, agentCredentials } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";

// Proxy ElevenLabs conversation audio through our server so agents can play
// recordings inline without needing their own EL login. Auth-checked against
// the call's owning list.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const user = await requireAuth();
    const { conversationId } = await params;

    if (!conversationId || !/^conv_[a-z0-9]+$/i.test(conversationId)) {
      return NextResponse.json(
        { success: false, error: "Invalid conversation id" },
        { status: 400 }
      );
    }

    // Look up the call → entry → list to enforce access and find the bot.
    const [row] = await db
      .select({
        callAgentId: calls.elevenlabsAgentId,
        listAgentId: callLists.agentId,
      })
      .from(calls)
      .innerJoin(callEntries, eq(calls.callEntryId, callEntries.id))
      .innerJoin(callLists, eq(callEntries.callListId, callLists.id))
      .where(eq(calls.conversationId, conversationId))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { success: false, error: "Recording not found" },
        { status: 404 }
      );
    }

    const isPrivileged = user.role === "admin" || user.role === "it_admin";
    if (!isPrivileged && row.listAgentId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    // Match the bot that made the call so we use its API key.
    if (!row.callAgentId) {
      return NextResponse.json(
        { success: false, error: "Recording not linked to a bot" },
        { status: 404 }
      );
    }
    const [bot] = await db
      .select({ elevenlabsApiKey: agentCredentials.elevenlabsApiKey })
      .from(agentCredentials)
      .where(eq(agentCredentials.elevenlabsAgentId, row.callAgentId))
      .limit(1);

    if (!bot) {
      return NextResponse.json(
        { success: false, error: "Bot credentials not found" },
        { status: 404 }
      );
    }

    const apiKey = decrypt(bot.elevenlabsApiKey);

    // Forward Range so scrubbing works if EL supports it.
    const upstreamHeaders: HeadersInit = { "xi-api-key": apiKey };
    const range = req.headers.get("range");
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
      { headers: upstreamHeaders }
    );

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      console.error(
        `[audio-proxy] EL fetch failed for ${conversationId}: ${upstream.status} ${text.slice(0, 200)}`
      );
      return NextResponse.json(
        { success: false, error: "Recording unavailable" },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const headers = new Headers();
    headers.set(
      "content-type",
      upstream.headers.get("content-type") || "audio/mpeg"
    );
    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    // Not caching in Blob yet — private to the requesting user only.
    headers.set("cache-control", "private, max-age=0, no-store");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
