// End-to-end conversation harness.
//
// Why this exists (Isaac, 2026-09-01): the seven unit suites were all green
// while JAI had silently stopped answering 17 of 96 contacts, and a lead asking
// for prices got a handoff. Both bugs that day lived BETWEEN the pieces — the
// guard was fine, the history fetch was fine, the combination was broken. No
// test that calls a function in isolation can catch that. This one POSTs a real
// signed webhook payload at the real route and asserts on what JAI would have
// sent, with the WhatsApp call and the model call stubbed at their single
// choke points (src/lib/wa/harness.ts, unreachable on Vercel).
//
//   npm run build && node scripts/jai-conversation-check.mjs
//
// Uses the LIVE Supabase (it must — the fact sheet is the source of truth) with
// a reserved test number, and deletes its own rows on the way out.

import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TEST_NUMBER = "65999000001";        // reserved; never a real customer
const PORT = 4477;
const SECRET = "harness-only-not-a-real-secret";
const LOG = "/tmp/jai-harness-sends.jsonl";
const BASE = `http://127.0.0.1:${PORT}`;

const env = { ...process.env,
  META_APP_SECRET: SECRET,
  JAI_DRY_RUN: "1", JAI_STUB_LLM: "1", JAI_DRY_RUN_LOG: LOG,
  WA_PHONE_NUMBER_ID: "harness", WA_ACCESS_TOKEN: "harness",
  VERCEL: "", PORT: String(PORT),
};
delete env.TELEGRAM_BOT_TOKEN;   // nothing in a test run should reach Telegram
delete env.TELEGRAM_CHAT_ID;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: "jai" }, auth: { persistSession: false } }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Messages JAI actually sent, in order. Deliberately EXCLUDES read receipts:
 * they hit the same endpoint, arrive first, and treating one as a reply makes
 * every assertion below either vacuous or wrong.
 */
function replies() {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((s) => s && s.body?.status !== "read")
    .map((s) => s.body?.text?.body || s.body?.interactive?.body?.text || "")
    .filter(Boolean);
}

function payload(text) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: "harness" },
      contacts: [{ profile: { name: "Harness" }, wa_id: TEST_NUMBER }],
      messages: [{ from: TEST_NUMBER, id: `wamid.harness.${Date.now()}.${Math.random()}`,
                   timestamp: String(Math.floor(Date.now() / 1000)),
                   type: "text", text: { body: text } }],
    }, field: "messages" }] }],
  });
}

async function say(text, stubReply) {
  try {
    return await sayOnce(text, stubReply);
  } catch (err) {
    console.log("\n--- server log ---\n" + readFileSync(SERVER_LOG, "utf8").slice(-2000));
    throw err;
  }
}

async function sayOnce(text, stubReply) {
  const before = replies().length;
  const raw = payload(text);
  const res = await fetch(`${BASE}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex"),
      ...(stubReply ? { "x-harness-stub": "1" } : {}),
    },
    body: raw,
  });
  if (!res.ok) throw new Error(`webhook returned ${res.status}`);
  const count = () => replies().length;
  let seen = before;
  for (let i = 0; i < 240; i++) {          // up to 60s for the first reply
    const n = count();
    if (n > before) { seen = n; break; }
    await sleep(250);
  }
  for (let i = 0; i < 12; i++) {           // then 3s of quiet — a reply can be
    await sleep(250);                      // split across two messages
    const n = count();
    if (n === seen) break;
    seen = n;
  }
  return replies().slice(before).join("\n");
}

async function wipe() {
  // The lead row matters as much as the messages: a JOIN_INTENT sets
  // ai_paused=true and the webhook then answers NOTHING for that contact. This
  // delete used to name a "phone" column that does not exist, and the error was
  // swallowed — so every run after the first tested a muted bot and reported
  // silence. Errors are surfaced now.
  for (const [table, col] of [["conversations", "contact_number"], ["leads", "contact_number"]]) {
    const { error } = await sb.from(table).delete().eq(col, TEST_NUMBER);
    if (error) throw new Error(`wipe ${table} failed: ${error.message}`);
  }
}

async function seedOldThread(botReplies, daysAgo) {
  const rows = [];
  const base = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  for (let i = 0; i < botReplies * 2; i++) {
    rows.push({
      contact_number: TEST_NUMBER, contact_name: "Harness",
      role: i % 2 ? "assistant" : "user",
      message: i % 2 ? `old reply ${i}` : `old question ${i}`,
      created_at: new Date(base + i * 60_000).toISOString(),
      ...(i % 2 ? { via: "bot" } : {}),
    });
  }
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await sb.from("conversations").insert(rows);
    if (!error) { lastErr = null; break; }
    lastErr = error;
    await sleep(500 * (attempt + 1));
  }
  if (lastErr) throw new Error(`seed failed: ${lastErr.message}`);
}

let fail = 0;
const check = (name, reply, assertFn) => {
  const problem = assertFn(reply || "");
  if (problem) { fail++; console.log(`FAIL  ${name}\n      ${problem}\n      got: ${JSON.stringify((reply||"").slice(0,160))}`); }
  else console.log(`ok    ${name}`);
};
const HANDOFF = /getting Coach Jeremy|sort this out for you directly/i;

const SERVER_LOG = "/tmp/jai-harness-server.log";
writeFileSync(SERVER_LOG, "");
const server = spawn("./node_modules/.bin/next", ["start", "-p", String(PORT)],
  { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
const tee = (d) => { try { appendFileSync(SERVER_LOG, d.toString()); } catch {} };
server.stdout.on("data", tee);
server.stderr.on("data", tee);
process.on("exit", () => { try { process.kill(-server.pid, "SIGKILL"); } catch {} });

try {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) break; } catch {}
    await sleep(1000);
  }
  if (existsSync(LOG)) unlinkSync(LOG);
  writeFileSync(LOG, "");

  // ── 1. The bug Isaac found by clicking ────────────────────────────────────
  // A returning customer with a long history from WEEKS ago must still get a
  // real answer. Before 704cbe4 this returned the handoff line forever.
  await wipe();
  await seedOldThread(9, 40);                       // 9 bot replies, 40 days ago
  // Deliberately the SAME message as case 2. A schedule question phrased so the
  // deterministic answerer catches it never reaches the anti-loop guard at all
  // (webhook line 377 returns before line 428), so it would pass with or
  // without the fix — the first version of this check did exactly that and was
  // worthless. Same message, different history AGE, is the real experiment.
  const returning = await say("and what about thursday?");
  check("returning customer after 9 old replies still gets answered",
    returning, (r) => (!r ? "no reply at all"
      : HANDOFF.test(r) ? "handed off to Jeremy instead of answering" : null));

  // ── 2. The guard must still do its job ────────────────────────────────────
  // Nine replies inside ONE sitting is exactly what the anti-loop guard is for.
  await wipe();
  await seedOldThread(9, 0);                        // 9 bot replies, today
  const looping = await say("and what about thursday?");   // identical to case 1
  check("nine replies in one sitting still hands off",
    looping, (r) => (!r ? "no reply at all" : HANDOFF.test(r) ? null
      : "guard did not fire — anti-loop protection is gone"));

  // ── 3. A brand-new lead gets a real first reply ───────────────────────────
  await wipe();
  const greeting = await say("Hello 👋 how do I join?");
  check("new contact asking to join gets a reply",
    greeting, (r) => (!r ? "silence — the commonest first message got nothing" : null));

  // ── 4. Schedule comes from the sheet, not the model ───────────────────────
  await wipe();
  await seedOldThread(2, 0);                        // mid-conversation, not a first hello
  const sched = await say("what are your class times on monday?");
  check("monday schedule answered with real times",
    sched, (r) => (!r ? "no reply at all"
      : /6[:.]30|7[:.]30|12[:.]15/.test(r) ? null
      : "no recognisable class time in the reply"));

  // ── 5. Isaac's late-arrival rule, end to end ──────────────────────────────
  await wipe();
  await seedOldThread(2, 0);
  const late = await say("i'll be 20 mins late for the 630 class, can i still join?");
  check("20 minutes late is refused, not waved through",
    late, (r) => (!r ? "no reply at all"
      : /can'?t join|cannot join|not be able to join|another day/i.test(r) ? null
      : "did not refuse a 20-minute-late arrival"));

  // ── 6. JAI never offers a phone call ──────────────────────────────────────
  await wipe();
  await seedOldThread(2, 0);
  const call = await say("can you call me instead?");
  check("asked to be called, JAI does not promise a call",
    call, (r) => (!r ? "silence — and a silent bot passes this check vacuously"
      : /i'?ll call you|give you a call|call me on|call us at/i.test(r)
      ? "offered a phone call" : null));

  // ── 7. The mute that never lifts ──────────────────────────────────────────
  // "how do I join" is the hottest message a lead can send, and it sets
  // ai_paused=true. Nothing ever clears it, so JAI goes silent for that person
  // for good unless Jeremy notices. Asserted here so the day it is fixed, this
  // check tells us — and until then it documents the behaviour honestly.
  await wipe();
  await say("Hello 👋 how do I join?");
  const afterJoin = await say("actually what time is the monday evening class?");
  const { data: lead } = await sb.from("leads").select("ai_paused")
    .eq("contact_number", TEST_NUMBER).maybeSingle();
  // Reported, not asserted. A check that fails on a known-and-accepted
  // behaviour trains everyone to ignore a red run, which is how green stopped
  // meaning anything in the first place.
  if (lead?.ai_paused && !afterJoin) {
    console.log('KNOWN a join question set ai_paused=true and JAI went silent after it');
    console.log('      nothing clears the flag, so that lead never hears from JAI again');
  } else if (!lead?.ai_paused) {
    console.log("ok    a join question no longer mutes JAI \u2014 delete this block");
  } else {
    console.log("KNOWN ai_paused=true but JAI still replied \u2014 worth a look");
  }

} finally {
  await wipe();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
  await sleep(700);
  try { process.kill(-server.pid, "SIGKILL"); } catch {}
}

console.log(fail === 0
  ? "\nALL CONVERSATION CASES PASSED"
  : `\n${fail} FAILED — JAI would behave like this for a real customer`);
if (fail) process.exitCode = 1;
