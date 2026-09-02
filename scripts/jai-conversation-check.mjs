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

import { createHmac, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TEST_NUMBER = "65999000001";        // reserved; never a real customer
const PORT = 4477;
const SECRET = randomBytes(32).toString("hex");   // per run; never committed
const LOG = "/tmp/jai-harness-sends.jsonl";
const STUB = "/tmp/jai-harness-stub.json";   // the draft the stubbed model returns
const BASE = `http://127.0.0.1:${PORT}`;

const env = { ...process.env,
  META_APP_SECRET: SECRET,
  JAI_DRY_RUN: "1", JAI_STUB_LLM: "1", JAI_DRY_RUN_LOG: LOG,
  JAI_STUB_LLM_REPLY_FILE: STUB,
  WA_PHONE_NUMBER_ID: "harness", WA_ACCESS_TOKEN: "harness",
  VERCEL: "", PORT: String(PORT),
};
// Nothing in a test run may reach Telegram. The var that matters is
// JMT_TELEGRAM_BOT_TOKEN — every path in src/lib/telegram-alert.ts reads that
// one, and deleting only TELEGRAM_BOT_TOKEN was a no-op that happened to be
// harmless solely because the real token is absent from .env.local. After a
// `vercel env pull` this harness would have DMed the real master_admins about a
// customer called "Harness". Found by the /predeploy security lane.
delete env.JMT_TELEGRAM_BOT_TOKEN;
delete env.TELEGRAM_BOT_TOKEN;
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

/** @param stubReply what the stubbed model should draft, so the guards have something real to act on */
async function say(text, stubReply) {
  writeFileSync(STUB, stubReply ? JSON.stringify({ message: stubReply }) : "");
  try {
    return await sayOnce(text);
  } catch (err) {
    console.log("\n--- server log ---\n" + readFileSync(SERVER_LOG, "utf8").slice(-2000));
    throw err;
  }
}

async function sayOnce(text) {
  const before = replies().length;
  const raw = payload(text);
  const res = await fetch(`${BASE}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex"),
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
  if (!/^65999000001$/.test(TEST_NUMBER)) {
    throw new Error(`refusing to wipe a number that is not the reserved test one: ${TEST_NUMBER}`);
  }
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
  // rows run forward from `base`, so start far enough back that the newest
  // one lands in the past — otherwise "today" seeds sit in the future.
  const base = Date.now() - daysAgo * 24 * 60 * 60 * 1000 - botReplies * 2 * 60_000;
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
// Two different handoffs share the word "Jeremy". The anti-loop one is the only
// one case 1 and 2 are about; JOIN_HANDOFF_TEXT ("I'm getting Coach Jeremy on
// this now") must NOT be able to satisfy them.
const ANTI_LOOP_HANDOFF = /sort this out for you directly/i;
// The whole-message handoff — now reserved for a binned reply.
const BARE_JOIN_HANDOFF = /getting Coach Jeremy on this now/i;
// The closing line appended AFTER an answer.
const JOIN_SUFFIX = /getting Coach Jeremy on this too/i;

const SERVER_LOG = "/tmp/jai-harness-server.log";
writeFileSync(SERVER_LOG, "");
const server = spawn("./node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", String(PORT)],
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
      : ANTI_LOOP_HANDOFF.test(r) ? "handed off to Jeremy instead of answering" : null));

  // ── 2. The guard must still do its job ────────────────────────────────────
  // Nine replies inside ONE sitting is exactly what the anti-loop guard is for.
  await wipe();
  await seedOldThread(9, 0);                        // 9 bot replies, today
  const looping = await say("and what about thursday?");   // identical to case 1
  check("nine replies in one sitting still hands off",
    looping, (r) => (!r ? "no reply at all"
      : ANTI_LOOP_HANDOFF.test(r) ? null
      : BARE_JOIN_HANDOFF.test(r) ? "the JOIN handoff fired, not the anti-loop one — this case proves nothing"
      : "guard did not fire — anti-loop protection is gone"));

  // ── 3. A brand-new lead gets a real first reply ───────────────────────────
  await wipe();
  // Isaac, 1 Sep: "JAI should have handle it as it was... it was perfectly
  // fine." The bare handoff must never be the whole message again — the
  // customer keeps the answer AND Jeremy still gets pinged.
  const greeting = await say("Hello 👋 how do I join?",
    "Great question! Our All-Levels class suits complete beginners, and a drop-in is $42. You can book straight from the website.");
  check("a join question is ANSWERED, then handed over",
    greeting, (r) => {
      if (!r) return "silence — the commonest first message got nothing";
      if (BARE_JOIN_HANDOFF.test(r)) return "handed off INSTEAD of answering — the 30 Jul regression is back";
      if (!/drop-in|\$42|All-Levels|beginner/i.test(r)) return "no actual answer reached the customer";
      if (!JOIN_SUFFIX.test(r)) return "answered but Jeremy was never mentioned — the handover is missing";
      return null;
    });

  // The one case that must STILL bin the text: a figure outside the rate card.
  // That is what the 2026-07-29 "$252" incident was actually about.
  await wipe();
  await seedOldThread(2, 0);
  // Deliberately a draft that BOTH outbound guards pass: no forbidden figure,
  // and "250" is on the rate card. Only refusing to run the model catches this.
  const promo = await say("is the $252 offer still on?",
    "Yes, that rate is still valid — I believe that's the 3-month rate at $250/month.");
  // I widened this assertion once to make it pass, and the code review proved
  // it would then go GREEN on the literal 2026-07-29 incident text — "I believe
  // that's the 3-month rate at $250/month" — because 250 is on the rate card,
  // and on a digit-free "Yes, that rate is still valid". Loosening a test to
  // accommodate behaviour is how the incident gets shipped twice.
  //
  // What must be true: the model's draft is BINNED, not garnished. Asserted on
  // the wire AND in the database, not inferred from a suffix that is always
  // present anyway.
  const { data: promoLead } = await sb.from("leads").select("ai_paused")
    .eq("contact_number", TEST_NUMBER).maybeSingle();
  check("a promo ask never reaches the model's draft",
    promo, (r) => {
      if (!r) return "no reply at all";
      if (/252|250\s*\/?\s*(month|mo)|still (on|valid|running)/i.test(r))
        return "the promo draft reached the customer — this is the 2026-07-29 incident";
      if (!BARE_JOIN_HANDOFF.test(r)) return "the draft was not binned, only decorated";
      if (!promoLead?.ai_paused) return "reply was binned but JAI was not paused for Jeremy";
      return null;
    });

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
  // Pin a draft that DOES offer a call, otherwise this check passes because the
  // fixture never contained one — it was theatre before this line existed.
  const call = await say("can you call me instead?",
    "Sure thing! I'll give you a call this afternoon — what number is best?");
  check("a draft offering a phone call is intercepted before it is sent",
    call, (r) => (!r ? "silence — and a silent bot passes this check vacuously"
      : /i'?ll call you|give you a call|call me on|call us at/i.test(r)
      ? "offered a phone call" : null));

  // ── 6b. A promo figure smuggled in on a buy signal ────────────────────────
  // The intent split alone did not stop this: 252 parses as the clock time 2:52,
  // so the classifier called it wants_to_join and it reached the model. The
  // outbound guard cannot help — it needs a currency marker, and the model
  // echoes the figure bare because the customer wrote it bare.
  await wipe();
  await seedOldThread(2, 0);
  const smuggled = await say(
    "I want to join, my friend paid 252 monthly for the class, same for me?",
    "Yes 252 is correct for the 3-month plan — happy to get you signed up at that.");
  check("a bare promo figure on a buy signal is handed over, not answered",
    smuggled, (r) => (!r ? "no reply at all"
      : /252/.test(r) ? "the figure was confirmed to the customer"
      : BARE_JOIN_HANDOFF.test(r) ? null
      : "neither answered safely nor handed over"));

  // ── 6c. The outbound money guard, actually exercised ──────────────────────
  // Every other scenario runs on a digit-free draft, so priceLeak — the branch
  // that BINS the text and pauses JAI — was never once under test.
  await wipe();
  await seedOldThread(2, 0);
  const leaked = await say("what do you charge for unlimited?",
    "Our unlimited membership is $252/month with the promo.");
  // Observed: the FACT GUARD catches this first and produces its own deflection
  // ("let me double-check that with Coach Jeremy"), so `priceLeak` never fires.
  // That is worth stating plainly rather than contriving a case to reach it:
  // anything hasDisallowedPrice would catch, the fact guard has already caught,
  // because the guard rejects any price not in the sheet while hasDisallowedPrice
  // only rejects those not on the rate card. priceLeak is a backstop BEHIND it,
  // and its unreachability here is defence in depth working, not a gap.
  //
  // So assert what actually matters, and keep it strict: the figure must not
  // reach the customer, and the customer must be pointed at Jeremy. A confident
  // answer, or any reply containing 252, still fails.
  check("an off-card price never reaches the customer",
    leaked, (r) => (!r ? "no reply at all"
      : /252/.test(r) ? "the off-card price reached the customer"
      : /coach jeremy/i.test(r) ? null
      : "price dropped but the customer was not pointed at Jeremy"));

  // ── 7. The mute that never lifts ──────────────────────────────────────────
  // "how do I join" is the hottest message a lead can send, and it sets
  // ai_paused=true. Nothing ever clears it, so JAI goes silent for that person
  // for good unless Jeremy notices. Asserted here so the day it is fixed, this
  // check tells us — and until then it documents the behaviour honestly.
  await wipe();
  await say("Hello 👋 how do I join?");
  const afterJoin = await say("actually what time is the monday evening class?");
  const { data: lead, error: leadErr } = await sb.from("leads").select("ai_paused")
    .eq("contact_number", TEST_NUMBER).maybeSingle();
  // Fail CLOSED. Discarding this error made a failed or permission-denied read
  // look like a pass, which is the same class of thing as a test that cannot
  // fail. (/predeploy code-review lane, 2026-09-02.)
  if (leadErr) { fail++; console.log(`FAIL  could not read ai_paused back: ${leadErr.message}`); }
  // Reported, not asserted. A check that fails on a known-and-accepted
  // behaviour trains everyone to ignore a red run, which is how green stopped
  // meaning anything in the first place.
  if (lead?.ai_paused) {
    fail++;
    console.log("FAIL  a join question set ai_paused=true again \u2014 that mute never clears");
  } else if (!afterJoin) {
    fail++;
    console.log("FAIL  JAI went silent after a join question even though ai_paused is false");
  } else {
    console.log("ok    a join question pings Jeremy WITHOUT muting JAI");
    console.log("      note: Jeremy taking a chat over from the inbox still sets ai_paused,");
    console.log("      and 28 of 83 leads were still stuck on it as of 1 Sep (ISA-52)");
  }

} finally {
  await wipe();
  try { if (existsSync(LOG)) unlinkSync(LOG); } catch {}
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
  await sleep(700);
  try { process.kill(-server.pid, "SIGKILL"); } catch {}
}

console.log(fail === 0
  ? "\nALL CONVERSATION CASES PASSED"
  : `\n${fail} FAILED — JAI would behave like this for a real customer`);
if (fail) process.exitCode = 1;
