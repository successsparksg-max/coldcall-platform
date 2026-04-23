/*
 * One-off: reclassify Victoria's historical "failed" call_entries as "no_answer"
 * when the underlying ElevenLabs conversation's SIP code indicates the phone
 * was off / busy / request terminated / canceled (408/480/486/487/600/603/604/1011).
 *
 * Strategy:
 *   1) Pull the time window of failed DB entries, per bot.
 *   2) Page ElevenLabs conversations for each bot agent in that window.
 *   3) Fetch details to extract SIP code.
 *   4) Match DB entry to EL conv by timestamp (±30s); reclassify where appropriate,
 *      update counters, and backfill conversation_id + duration when we now know it.
 */

import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
function getKey() {
  const k = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const b = Buffer.from(k, "base64");
  return b.length === 32 ? b : crypto.createHash("sha256").update(k).digest();
}
const KEY = getKey();
function decrypt(val) {
  const p = val.split(":");
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(p[0], "hex"));
  d.setAuthTag(Buffer.from(p[1], "hex"));
  return d.update(p[2], "hex", "utf8") + d.final("utf8");
}

const NO_ANSWER_SIP_CODES = new Set([408, 480, 486, 487, 600, 603, 604, 1011]);
const DRY_RUN = process.argv.includes("--dry-run");

const VICTORIA = "e389ce75-9d30-437f-985e-c47c887c463e";

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN (no DB writes) ===" : "=== LIVE (DB writes enabled) ===");

  // Load Victoria's bot credentials
  const bots = (
    await pool.query(
      `SELECT id, elevenlabs_api_key, elevenlabs_agent_id
       FROM agent_credentials WHERE agent_id = $1`,
      [VICTORIA]
    )
  ).rows.map((b) => ({
    id: b.id,
    agentId: b.elevenlabs_agent_id,
    key: decrypt(b.elevenlabs_api_key),
  }));

  console.log(`Found ${bots.length} bots for Victoria`);

  // Determine time range for failed entries
  const range = await pool.query(
    `SELECT
       MIN(ce.call_started_at) AS min_t,
       MAX(ce.call_started_at) AS max_t,
       COUNT(*) AS total
     FROM call_entries ce
     JOIN call_lists cl ON ce.call_list_id = cl.id
     WHERE cl.agent_id = $1 AND ce.call_status = 'failed'`,
    [VICTORIA]
  );
  const { min_t, max_t, total } = range.rows[0];
  console.log(`Failed entries to consider: ${total}`);
  console.log(`Time range: ${min_t} -> ${max_t}`);

  const minUnix = Math.floor(new Date(min_t).getTime() / 1000) - 60;

  // Page ALL EL conversations per bot in that window, index by timestamp
  const elByBot = new Map(); // botCredId -> [{id, start, status}, ...]
  for (const bot of bots) {
    console.log(`\nFetching EL conversations for bot ${bot.id.slice(0, 8)} (agent=${bot.agentId})...`);
    const convs = [];
    let cursor = null;
    let pages = 0;
    while (true) {
      const url =
        `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${bot.agentId}` +
        `&page_size=100&call_start_after_unix=${minUnix}` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const r = await fetch(url, { headers: { "xi-api-key": bot.key } });
      if (!r.ok) {
        console.log(`  List error ${r.status}: ${await r.text()}`);
        break;
      }
      const j = await r.json();
      const items = j.conversations || [];
      for (const c of items) {
        convs.push({
          id: c.conversation_id,
          start: c.start_time_unix_secs,
          status: c.status,
        });
      }
      pages++;
      cursor = j.next_cursor;
      if (!cursor || items.length === 0) break;
      if (pages % 5 === 0) console.log(`  ...${convs.length} so far`);
    }
    elByBot.set(bot.id, convs);
    console.log(`  Total: ${convs.length} conversations`);
  }

  // Fetch DB failed entries with their list's bot
  const failed = await pool.query(
    `SELECT ce.id AS entry_id, ce.phone_number, ce.call_started_at, ce.conversation_id,
            cl.id AS list_id, cl.bot_credential_id
     FROM call_entries ce
     JOIN call_lists cl ON ce.call_list_id = cl.id
     WHERE cl.agent_id = $1 AND ce.call_status = 'failed'
     ORDER BY ce.call_started_at DESC`,
    [VICTORIA]
  );
  console.log(`\nDB failed entries loaded: ${failed.rows.length}`);

  // For each failed entry, find its matching EL conversation (±30s on same bot)
  const candidates = [];
  let alreadyHaveConv = 0;
  let noMatch = 0;
  for (const row of failed.rows) {
    const botConvs = elByBot.get(row.bot_credential_id) || [];
    if (row.conversation_id) {
      // We already have conv_id — use it directly
      const match = botConvs.find((c) => c.id === row.conversation_id);
      if (match) {
        candidates.push({ entry: row, conv: match });
        alreadyHaveConv++;
        continue;
      }
    }
    if (!row.call_started_at) {
      noMatch++;
      continue;
    }
    const dbT = Math.floor(new Date(row.call_started_at).getTime() / 1000);
    // Find closest EL conv within ±30s
    const match = botConvs.find((c) => Math.abs(c.start - dbT) <= 30);
    if (match) {
      candidates.push({ entry: row, conv: match });
    } else {
      noMatch++;
    }
  }
  console.log(`  Matched to EL conversation: ${candidates.length} (incl. ${alreadyHaveConv} via existing conv_id)`);
  console.log(`  No EL match: ${noMatch}`);

  // For each candidate, fetch details to extract SIP code
  console.log(`\nFetching details for matched conversations (this may take a few minutes)...`);
  const apiKeyByBot = Object.fromEntries(bots.map((b) => [b.id, b.key]));
  let reclassify = 0;
  let keepFailed = 0;
  let detailErrs = 0;
  const perListDelta = new Map(); // list_id -> {noAnsDelta, failedDelta}
  const sipCodeDist = {};
  const updates = []; // {entryId, listId, newStatus, conversationId, durationSecs, endedAt}

  for (let i = 0; i < candidates.length; i++) {
    const { entry, conv } = candidates[i];
    const key = apiKeyByBot[entry.bot_credential_id];
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${conv.id}`,
        { headers: { "xi-api-key": key } }
      );
      if (!r.ok) {
        detailErrs++;
        continue;
      }
      const j = await r.json();
      const meta = j.metadata || {};
      const errObj = meta.error;
      const sipCode =
        typeof errObj === "object" && errObj !== null ? errObj.code : null;
      const durationSecs =
        meta.call_duration_secs || meta.duration_secs || 0;
      const elStatus = j.status;

      sipCodeDist[sipCode ?? "?"] = (sipCodeDist[sipCode ?? "?"] || 0) + 1;

      // If EL conversation status is "done", they actually had a conversation —
      // this is answered, not no_answer. Flag for manual review rather than
      // automatically flipping.
      if (elStatus === "done" && durationSecs >= 5) {
        keepFailed++;
        continue;
      }

      if (NO_ANSWER_SIP_CODES.has(sipCode)) {
        reclassify++;
        const endedAt = conv.start
          ? new Date((conv.start + durationSecs) * 1000).toISOString()
          : null;
        updates.push({
          entryId: entry.entry_id,
          listId: entry.list_id,
          newStatus: "no_answer",
          conversationId: entry.conversation_id || conv.id,
          durationSecs,
          endedAt,
        });
        const d = perListDelta.get(entry.list_id) || { noAnsDelta: 0, failedDelta: 0 };
        d.noAnsDelta++;
        d.failedDelta--;
        perListDelta.set(entry.list_id, d);
      } else {
        keepFailed++;
      }
    } catch {
      detailErrs++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  ...${i + 1}/${candidates.length} processed (reclassify=${reclassify}, keep=${keepFailed}, errs=${detailErrs})`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  SIP code distribution:`, sipCodeDist);
  console.log(`  To reclassify failed -> no_answer: ${reclassify}`);
  console.log(`  Keep as failed (non-no-answer SIP code or real conversation): ${keepFailed}`);
  console.log(`  Detail fetch errors: ${detailErrs}`);
  console.log(`  Unmatchable (no EL conv found): ${noMatch}`);

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Skipping writes.`);
    await pool.end();
    return;
  }

  if (updates.length === 0) {
    console.log(`Nothing to update.`);
    await pool.end();
    return;
  }

  console.log(`\nApplying ${updates.length} entry updates and ${perListDelta.size} list counter updates...`);

  // Apply entry updates in batches of 100 for responsiveness
  for (let i = 0; i < updates.length; i += 100) {
    const slice = updates.slice(i, i + 100);
    await pool.query("BEGIN");
    try {
      for (const u of slice) {
        await pool.query(
          `UPDATE call_entries
           SET call_status = $1,
               conversation_id = COALESCE(conversation_id, $2),
               call_duration_seconds = COALESCE(call_duration_seconds, $3),
               call_ended_at = COALESCE(call_ended_at, $4::timestamptz),
               updated_at = now()
           WHERE id = $5 AND call_status = 'failed'`,
          [u.newStatus, u.conversationId, u.durationSecs, u.endedAt, u.entryId]
        );
      }
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      console.error(`Batch ${i} rolled back:`, e);
      throw e;
    }
    console.log(`  entries ${Math.min(i + 100, updates.length)}/${updates.length}`);
  }

  // Apply list counter adjustments
  for (const [listId, d] of perListDelta) {
    await pool.query(
      `UPDATE call_lists
       SET calls_no_answer = GREATEST(0, COALESCE(calls_no_answer, 0) + $1),
           calls_failed    = GREATEST(0, COALESCE(calls_failed, 0) + $2)
       WHERE id = $3`,
      [d.noAnsDelta, d.failedDelta, listId]
    );
  }
  console.log(`List counters updated for ${perListDelta.size} lists.`);

  console.log(`\nDone.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
