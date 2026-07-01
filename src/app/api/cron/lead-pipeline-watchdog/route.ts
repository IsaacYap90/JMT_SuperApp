// Lead-pipeline watchdog for JMT OS. Detects (a) the realtime Meta webhook
// silently going down (leads only arriving via the 30-min backup cron) and
// (b) a lead drought. Alerts Isaac/IonicX on Telegram (WATCHDOG_TG_CHAT_ID),
// only on problems; ?report=1 forces a health summary (weekly heartbeat).
//
// Signal: the backup cron (meta-lead-sync, */30) inserts at :00/:30; the
// realtime webhook inserts at the lead's actual time (any minute). So a 24h
// window where every lead landed on :00/:30 means the webhook isn't delivering.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tg(text: string) {
  const token = process.env.JMT_TELEGRAM_BOT_TOKEN;
  const chat = process.env.WATCHDOG_TG_CHAT_ID;
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
  });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const ok = auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("key") === secret;
  if (!ok && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = req.nextUrl.searchParams.get("report") === "1";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = Date.now();
  const since24 = new Date(now - 24 * 3600e3).toISOString();
  const droughtSince = new Date(now - 72 * 3600e3).toISOString();
  const activeStart = new Date(now - 14 * 24 * 3600e3).toISOString();

  const { data: recent } = await supabase
    .from("leads")
    .select("created_at")
    .eq("source", "meta_lead_form")
    .gte("created_at", since24)
    .order("created_at", { ascending: false });

  const rows = recent ?? [];
  let webhook = 0;
  let cron = 0;
  for (const r of rows) {
    const mm = new Date(r.created_at as string).getUTCMinutes();
    if (mm === 0 || mm === 30) cron++;
    else webhook++;
  }
  const total = rows.length;

  const problems: string[] = [];
  if (total >= 3 && webhook === 0) {
    problems.push(
      `🔴 <b>JMT webhook may be DOWN</b> — all ${total} leads in the last 24h were recovered by the backup cron, none in real time. Re-subscribe the page to leadgen + check the page token.`,
    );
  }
  if (total === 0) {
    const { count: prior } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("source", "meta_lead_form")
      .gte("created_at", activeStart)
      .lt("created_at", droughtSince);
    if ((prior ?? 0) >= 5) {
      problems.push(
        `🟡 <b>JMT lead DROUGHT</b> — 0 leads in 72h, but ${prior} in the 2 weeks prior. Check the ad campaign / webhook.`,
      );
    }
  }

  const summary = `JMT: ${total} leads/24h (${webhook} realtime · ${cron} reconciled)`;
  if (problems.length) await tg(`⚠️ <b>Lead pipeline watchdog</b>\n\n${problems.join("\n\n")}\n\n${summary}`);
  else if (report) await tg(`✅ <b>Lead pipeline watchdog — JMT healthy</b>\n\n${summary}`);

  return NextResponse.json({ ok: true, total, webhook, cron, problems: problems.length });
}
