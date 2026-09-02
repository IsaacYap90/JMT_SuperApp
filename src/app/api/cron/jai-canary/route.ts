// Daily end-to-end health check for JAI. Exercises the REAL reply path
// (generateReply → DeepSeek) with a realistic customer question and alerts
// Isaac on Telegram (WATCHDOG_TG_CHAT_ID). Sends every run, pass or fail, so
// a silent day means the canary itself is down.
//
// Triggered by Vercel Cron at "15 1 * * *" UTC = 09:15 SGT/MYT (UTC+8).
// generateReply is pure — it calls DeepSeek and parses the text. It writes
// nothing to jai.conversations / jai.leads, so this can't pollute the inbox.
//
// Telegram, not WhatsApp: a freeform WA send only delivers inside the 24h
// customer-service window, so on any day Isaac hadn't messaged JAI the alert
// would be silently dropped — the exact failure this canary exists to catch.
// Same channel as lead-pipeline-watchdog.
//
// ?dry=1 skips the Telegram send (local testing).

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { generateReply } from "@/lib/wa/jai-reply";
import { readJaiFacts } from "@/lib/wa/jai-facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// FIVE real customer questions, asked of the REAL model against the REAL fact
// sheet, with the answers checked for the properties that actually matter.
//
// WHY (2026-09-02): the fact sheet told JAI to answer any join question with one
// line — "I'm getting Coach Jeremy on this now" — and nothing else. The code had
// been changed to let it answer properly. Nobody noticed, because the offline
// suite stubs the model and a stubbed model cannot disobey the sheet. A customer
// got the handoff twice and no answer. This is the check that would have caught
// it: only the real model reads the sheet.
//
// 🛑 SCOPE: generateReply is the model plus the guards that live inside it (fact
// guard, timetable substitution, the phone-call and cut-off intercepts). It does
// NOT go through the webhook, so join-intent routing, the deterministic schedule
// answer, the anti-loop guard and the price bin are NOT covered here. Those are
// scripts/jai-conversation-check.mjs, which uses the real webhook and a stubbed
// model. Neither covers the combination; that gap is known and written down.
//
// Assertions are PROPERTIES, never exact wording — the model rephrases every
// run, and a canary that cries wolf gets ignored, which is worse than no canary.
type Probe = {
  ask: string;
  want: (reply: string) => string | null;   // null = healthy, string = what is wrong
};

const HANDOFF_ONLY = /^[^.!?]*coach jeremy[^.!?]*[.!?]?\s*$/i;

const PROBES: Probe[] = [
  {
    // The 2026-09-02 bug, exactly.
    ask: "how do i join?",
    want: (r) =>
      HANDOFF_ONLY.test(r.trim())
        ? "a join question got ONLY the handoff line — the fact sheet is ordering a deflection again"
        : /jaimuaythai\.com|\$\d|all[- ]levels|drop[- ]in/i.test(r)
          ? null
          : "a join question got no link, no price and no class name",
  },
  {
    ask: "what time is the wednesday evening class?",
    want: (r) =>
      !/7[:.]30/.test(r)
        ? "Wednesday evening did not mention 7:30"
        : /advanced/i.test(r)
          ? "called Wednesday 7:30pm Advanced — it is All Levels"
          : null,
  },
  {
    ask: "i'll be 20 mins late for the 6:30pm class, can i still join?",
    want: (r) =>
      /can'?t join|cannot join|not be able to join|too late|another day/i.test(r)
        ? null
        : "did not refuse a 20-minute-late arrival",
  },
  {
    ask: "can you call me instead?",
    want: (r) =>
      /i'?ll call you|give you a call|call you (?:back|later|tomorrow)/i.test(r)
        ? "offered to phone the customer — JAI cannot make calls"
        : null,
  },
  {
    ask: "how much is the monthly membership?",
    want: (r) =>
      /\$\s?\d{3}/.test(r) ? null : "a straight price question got no price",
  },
];
// Distinctive slice of the canned failure reply in jai-reply.ts
// ("Hey! Sorry, having a quick issue. Bear with me 🙏"). generateReply returns
// it on any DeepSeek error. It is a local literal there, not exported, so this
// substring is the loosest stable match available without editing that file.
const FALLBACK_MARKER = "having a quick issue";
const TIMEOUT_MS = 45_000;

async function tg(text: string): Promise<boolean> {
  const token = process.env.JMT_TELEGRAM_BOT_TOKEN;
  const chat = process.env.WATCHDOG_TG_CHAT_ID;
  if (!token || !chat) {
    console.error("[jai-canary] Telegram not configured");
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("[jai-canary] Telegram send failed:", res.status);
  return res.ok;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let reason: string | null = null;

  // Is JAI answering from the EDITABLE fact sheet, or has it silently dropped
  // back to the sheet baked into the build? Comparing the text proves nothing
  // (the row was seeded identical), so ask the read itself. A fallback means an
  // edit Jeremy or Isaac makes in the DB is not reaching customers.
  const facts = await readJaiFacts();

  // All five in parallel, inside one budget — five sequential model calls do not
  // fit in maxDuration.
  const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`no reply in ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
      ),
    ]);

  const results = await Promise.all(
    PROBES.map(async (probe) => {
      try {
        const res = await withTimeout(generateReply([{ role: "user", message: probe.ask }], false));
        const text = (res.messageText || "").trim();
        if (!text) return { ask: probe.ask, problem: "empty reply", reply: "" };
        if (text.includes(FALLBACK_MARKER)) {
          return { ask: probe.ask, problem: "canned fallback (model down?)", reply: text };
        }
        return { ask: probe.ask, problem: probe.want(text), reply: text };
      } catch (err) {
        return {
          ask: probe.ask,
          problem: err instanceof Error ? err.message : "threw",
          reply: "",
        };
      }
    })
  );

  const failures = results.filter((r) => r.problem);
  if (failures.length > 0) {
    reason = failures.map((f) => `"${f.ask}" → ${f.problem}`).join(" | ");
  }

  if (reason === null && facts.source === "fallback") {
    reason = `fact sheet fell back to the in-code copy (${facts.reason}) — DB edits are NOT live`;
  }

  const healthy = reason === null;
  const message = healthy
    ? `JAI canary OK — ${PROBES.length}/${PROBES.length} answers good, facts from DB`
    : `JAI CANARY FAILED (${failures.length}/${PROBES.length}) — ${reason}`.slice(0, 900);

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const sent = dry ? null : await tg(message);

  return NextResponse.json({
    ok: healthy,
    reason,
    message,
    sent,
    factsSource: facts.source,
    probes: results.map((r) => ({ ask: r.ask, ok: !r.problem, problem: r.problem })),
  });
}
