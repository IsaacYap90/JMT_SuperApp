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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUESTION = "what time are the beginner classes?";
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

  let reply = "";
  let reason: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      generateReply([{ role: "user", message: QUESTION }], false),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`no reply in ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
      }),
    ]);
    reply = result.messageText.trim();
    if (!reply) reason = "empty reply";
    else if (reply.includes(FALLBACK_MARKER)) reason = "canned fallback (DeepSeek down?)";
  } catch (err) {
    reason = err instanceof Error ? err.message : "threw";
  } finally {
    if (timer) clearTimeout(timer);
  }

  const healthy = reason === null;
  const message = healthy
    ? `JAI canary OK — ${reply.replace(/\s+/g, " ").slice(0, 60)}`
    : `JAI CANARY FAILED — ${reason}`;

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const sent = dry ? null : await tg(message);

  return NextResponse.json({ ok: healthy, reason, message, sent });
}
