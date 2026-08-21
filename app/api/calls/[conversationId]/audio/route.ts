import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calls, callEntries, callLists, agentCredentials } from "@/lib/schema";
import { requireAuth, handleAuthError } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";

// Give the proxy the full Vercel serverless window — a multi-minute recording
// otherwise gets truncated mid-download if the default timeout fires.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Proxy ElevenLabs conversation audio through our server so agents can play
// recordings inline without needing their own EL login. Auth-checked against
// the call's owning list.
//
// EL's audio endpoint returns the whole MP3 without Content-Length and without
// Range support. We buffer once, then serve back with a real Content-Length
// and byte-Range support so the HTML5 player knows the duration, can scrub,
// and does not cut off partway through.
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

    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
      { headers: { "xi-api-key": apiKey } }
    );

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error(
        `[audio-proxy] EL fetch failed for ${conversationId}: ${upstream.status} ${text.slice(0, 200)}`
      );
      return NextResponse.json(
        { success: false, error: "Recording unavailable" },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    // Buffer once so we can advertise a real Content-Length and honor Range.
    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    const totalLength = audioBuffer.length;
    const contentType = upstream.headers.get("content-type") || "audio/mpeg";

    const baseHeaders = new Headers({
      "content-type": contentType,
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=0, no-store",
    });

    // Handle a Range request from the browser (needed for seeking / reliable
    // full playback in some browsers).
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2]
          ? Math.min(parseInt(match[2], 10), totalLength - 1)
          : totalLength - 1;

        if (
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start > end ||
          start >= totalLength
        ) {
          return new NextResponse(null, {
            status: 416,
            headers: {
              "content-range": `bytes */${totalLength}`,
              "accept-ranges": "bytes",
            },
          });
        }

        const chunk = audioBuffer.subarray(start, end + 1);
        baseHeaders.set("content-length", String(chunk.length));
        baseHeaders.set(
          "content-range",
          `bytes ${start}-${end}/${totalLength}`
        );
        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: baseHeaders,
        });
      }
    }

    baseHeaders.set("content-length", String(totalLength));
    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: baseHeaders,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
