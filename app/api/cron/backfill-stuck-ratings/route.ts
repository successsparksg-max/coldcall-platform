import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  callEntries,
  calls,
  callLists,
  agentCredentials,
} from "@/lib/schema";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { inngest } from "@/lib/inngest/client";
import { and, eq, isNull } from "drizzle-orm";

// Daily cron: find call_entries marked "answered" but missing analysis
// (rating IS NULL), and dispatch call/analyze-transcript events for each.
// The Inngest function fetches the transcript from ElevenLabs if needed,
// runs analysis, and reclassifies voicemails to no_answer.
//
// Schedule and secret are configured in vercel.json.
// Vercel automatically sets Authorization: Bearer <CRON_SECRET> on cron requests.

// Cap per-run dispatch to keep the route well under Vercel function timeout
// even with hundreds of stuck entries. Inngest processes them async.
const MAX_PER_RUN = 500;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return apiError("Unauthorized", 401);
  }

  // Find all stuck entries across all agents/lists. Join on conversation_id
  // since calls.call_entry_id was populated inconsistently historically.
  const stuck = await db
    .select({
      entryId: callEntries.id,
      conversationId: callEntries.conversationId,
      callListId: callEntries.callListId,
      callDurationSeconds: callEntries.callDurationSeconds,
      botCredentialId: callLists.botCredentialId,
      agentId: callLists.agentId,
      callCost: calls.callCost,
      recordingUrl: calls.recordingUrl,
      duration: calls.duration,
    })
    .from(callEntries)
    .innerJoin(calls, eq(calls.conversationId, callEntries.conversationId))
    .innerJoin(callLists, eq(callLists.id, callEntries.callListId))
    .where(
      and(eq(callEntries.callStatus, "answered"), isNull(calls.rating))
    )
    .limit(MAX_PER_RUN);

  if (stuck.length === 0) {
    return apiSuccess({
      dispatched: 0,
      message: "No stuck entries found",
    });
  }

  // Cache API key lookups by bot_credential_id (one DB query per bot).
  const botCredIds = [...new Set(stuck.map((r) => r.botCredentialId).filter((v): v is string => !!v))];
  const credMap = new Map<string, string>();
  if (botCredIds.length > 0) {
    for (const bcid of botCredIds) {
      const [c] = await db
        .select({ apiKey: agentCredentials.elevenlabsApiKey })
        .from(agentCredentials)
        .where(eq(agentCredentials.id, bcid))
        .limit(1);
      if (c) credMap.set(bcid, c.apiKey);
    }
  }
  // For lists without a bot_credential_id, fall back to the agent's first bot.
  const agentIds = [
    ...new Set(
      stuck
        .filter((r) => !r.botCredentialId)
        .map((r) => r.agentId)
    ),
  ];
  const agentFallback = new Map<string, string>();
  for (const aid of agentIds) {
    const [c] = await db
      .select({ apiKey: agentCredentials.elevenlabsApiKey })
      .from(agentCredentials)
      .where(eq(agentCredentials.agentId, aid))
      .limit(1);
    if (c) agentFallback.set(aid, c.apiKey);
  }

  let dispatched = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of stuck) {
    if (!row.conversationId) {
      skipped++;
      continue;
    }
    const apiKeyEncrypted =
      (row.botCredentialId && credMap.get(row.botCredentialId)) ||
      agentFallback.get(row.agentId);
    if (!apiKeyEncrypted) {
      skipped++;
      errors.push(`${row.conversationId}: no API key`);
      continue;
    }
    try {
      await inngest.send({
        name: "call/analyze-transcript",
        data: {
          conversationId: row.conversationId,
          transcriptText: "", // empty → analyze-transcript will fetch from EL
          callDurationSecs:
            row.callDurationSeconds || row.duration || 0,
          cost: Number(row.callCost) || 0,
          recordingUrl:
            row.recordingUrl ||
            `https://elevenlabs.io/app/conversational-ai/history/${row.conversationId}`,
          elevenlabsApiKeyEncrypted: apiKeyEncrypted,
        },
      });
      dispatched++;
    } catch (e) {
      errors.push(
        `${row.conversationId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  console.log(
    `[cron-backfill-stuck-ratings] dispatched=${dispatched} skipped=${skipped} errors=${errors.length} (cap=${MAX_PER_RUN})`
  );

  return apiSuccess({
    dispatched,
    skipped,
    foundTotal: stuck.length,
    cappedAt: MAX_PER_RUN,
    errors: errors.slice(0, 10),
  });
}
