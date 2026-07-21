/*
 * Swap an agent's ElevenLabs phone numbers to new Twilio DIDs.
 *
 * Args:
 *   --email=<user email>                         (required)
 *   --sid=<twilio account SID>                   (required)
 *   --token=<twilio auth token>                  (required)
 *   --bot=<bot_label>:<new E.164>                (required, may repeat)
 *   --commit                                     (default: dry-run)
 *
 * Example:
 *   node scripts/swap-agent-numbers.mjs \
 *     --email=frazeerli68@gmail.com \
 *     --sid=AC... --token=xxx \
 *     --bot=Frazeer_Bot1:+6560443465 \
 *     --bot=Frazeer_Bot2:+6560443456 \
 *     --commit
 *
 * Old phnums are NOT deleted. Verify then delete manually.
 */
import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
function getKey() {
  const k = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const b = Buffer.from(k, "base64");
  return b.length === 32 ? b : crypto.createHash("sha256").update(k).digest();
}
const KEY = getKey();
function decrypt(val) {
  const [iv, tag, ct] = val.split(":");
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  return d.update(ct, "hex", "utf8") + d.final("utf8");
}

function arg(name) {
  const p = process.argv.find(a => a.startsWith(`--${name}=`));
  return p ? p.split("=").slice(1).join("=") : null;
}
function argAll(name) {
  return process.argv
    .filter(a => a.startsWith(`--${name}=`))
    .map(a => a.split("=").slice(1).join("="));
}

const EMAIL = arg("email");
const SID = arg("sid");
const TOKEN = arg("token");
const BOT_SPECS = argAll("bot");
const COMMIT = process.argv.includes("--commit");

if (!EMAIL || !SID || !TOKEN || BOT_SPECS.length === 0) {
  console.error("Usage: --email=X --sid=Y --token=Z --bot=Label:+E164 [--bot=...] [--commit]");
  process.exit(1);
}
const SWAPS = new Map();
for (const spec of BOT_SPECS) {
  const [label, num] = spec.split(":");
  SWAPS.set(label.trim(), { newNumber: num.trim(), label: num.replace(/^\+/, "").trim() });
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const u = await pool.query(`SELECT id FROM users WHERE email = $1`, [EMAIL]);
  if (u.rows.length === 0) { console.error(`No user with email ${EMAIL}`); process.exit(1); }
  const userId = u.rows[0].id;

  const bots = await pool.query(
    `SELECT id, bot_label, elevenlabs_api_key, elevenlabs_agent_id,
            elevenlabs_phone_number_id
     FROM agent_credentials WHERE agent_id = $1 ORDER BY bot_label`,
    [userId]
  );

  console.log(`\n=== ${EMAIL} phone-number swap ${COMMIT ? "[COMMIT]" : "[DRY-RUN]"} ===`);
  console.log(`  SID: ${SID}`);
  console.log(`  token: ${TOKEN.slice(0, 4)}...${TOKEN.slice(-4)}`);
  console.log(`  swaps requested:`);
  for (const [label, s] of SWAPS) console.log(`    ${label} → ${s.newNumber}`);
  console.log();

  for (const bot of bots.rows) {
    const swap = SWAPS.get(bot.bot_label);
    if (!swap) continue;

    const apiKey = decrypt(bot.elevenlabs_api_key);
    console.log(`--- ${bot.bot_label} ---`);
    console.log(`  old phnum:        ${bot.elevenlabs_phone_number_id}`);
    console.log(`  new number:       ${swap.newNumber}`);
    console.log(`  ElevenLabs agent: ${bot.elevenlabs_agent_id}`);

    if (!COMMIT) {
      console.log(`  (dry-run — no writes)\n`);
      continue;
    }

    const createBody = {
      provider: "twilio",
      phone_number: swap.newNumber,
      label: swap.label,
      sid: SID,
      token: TOKEN,
    };

    const createRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/phone-numbers/create`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      }
    );
    if (!createRes.ok) {
      console.log(`  CREATE failed (${createRes.status}): ${await createRes.text()}\n`);
      continue;
    }
    const created = await createRes.json();
    const newPhnumId = created.phone_number_id || created.id;
    console.log(`  ✓ created phnum: ${newPhnumId}`);

    const assignRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/phone-numbers/${newPhnumId}`,
      {
        method: "PATCH",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: bot.elevenlabs_agent_id }),
      }
    );
    if (!assignRes.ok) {
      console.log(`  ASSIGN failed (${assignRes.status}): ${await assignRes.text()}\n`);
      continue;
    }
    const assigned = await assignRes.json();
    console.log(`  ✓ assigned to: ${assigned.assigned_agent?.agent_name || "?"}`);

    // Also set telephony_provider='twilio' — if the bot was previously on a
    // SIP trunk it would still be 'didww' in the DB, which routes calls to
    // /v1/convai/sip-trunk/outbound-call and fails with
    // "This endpoint only works with SIP trunk phone numbers".
    await pool.query(
      `UPDATE agent_credentials
       SET elevenlabs_phone_number_id = $1,
           outbound_caller_id = $2,
           telephony_provider = 'twilio',
           updated_at = now()
       WHERE id = $3`,
      [newPhnumId, swap.newNumber, bot.id]
    );
    console.log(`  ✓ NeonDB updated (telephony_provider=twilio)\n`);
  }

  console.log(`=== done ===`);
  console.log(`Old phnums NOT deleted. Confirm with user before cleanup.\n`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
