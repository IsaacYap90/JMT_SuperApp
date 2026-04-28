// Trial reminder — 6-hour backstop ping.
//
// This is the safety net for two failure classes that the 24h cron cannot handle:
//   1. Late bookings (made <24h before trial start) — never fall in the
//      [23.5h, 24.5h] window, so the 24h cron silently skips them. The
//      Calendly webhook also fires on these now (see late-booking branch in
//      the webhook), but if Telegram delivery failed there, this catches it.
//   2. 24h cron failures (Vercel cron blip, transient Telegram error) — the
//      coach would otherwise only see the trial in the day-of 6am briefing.
//
// Window: trials whose class starts between 5.5h and 6.5h from now.
// Recipients: coaches assigned to the class + all admins (same as 24h cron).
// Runs every 30 minutes via Vercel Cron.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";
import { resolveTrialRecipients } from "@/lib/trial-recipients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fmtTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${suffix}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase env vars missing" }, { status: 500 });
  }
  const supabase = createClient(url, key);

  // Today and tomorrow in SGT — backstop window can straddle midnight if
  // the cron runs late evening for an early-morning trial.
  const now = new Date();
  const sgString = now.toLocaleString("en-US", { timeZone: "Asia/Singapore" });
  const sg = new Date(sgString);
  const todayY = sg.getFullYear();
  const todayM = sg.getMonth() + 1;
  const todayD = sg.getDate();
  const todayYmd = `${todayY}-${String(todayM).padStart(2, "0")}-${String(todayD).padStart(2, "0")}`;
  const tomorrow = new Date(sg);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomY = tomorrow.getFullYear();
  const tomM = tomorrow.getMonth() + 1;
  const tomD = tomorrow.getDate();
  const tomorrowYmd = `${tomY}-${String(tomM).padStart(2, "0")}-${String(tomD).padStart(2, "0")}`;

  const { data: trials } = await supabase
    .from("trial_bookings")
    .select("id, name, phone, class_id, booking_date, time_slot, status")
    .in("booking_date", [todayYmd, tomorrowYmd])
    .eq("status", "booked");

  if (!trials || trials.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no upcoming trials" });
  }

  const classIds = Array.from(new Set(trials.map((t) => t.class_id)));
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, start_time, end_time, lead_coach_id, assistant_coach_id, class_coaches(coach_id)")
    .in("id", classIds);

  type ClsRow = {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    lead_coach_id: string | null;
    assistant_coach_id: string | null;
    class_coaches: { coach_id: string }[] | null;
  };

  const classMap = new Map<string, ClsRow>();
  for (const c of (classes || []) as ClsRow[]) classMap.set(c.id, c);

  // Window: trial start is between 5.5h and 6.5h from now.
  const upcomingTrials: { trial: (typeof trials)[0]; cls: ClsRow }[] = [];
  for (const t of trials) {
    const cls = classMap.get(t.class_id);
    if (!cls) continue;
    const trialStartUtc = new Date(`${t.booking_date}T${cls.start_time}+08:00`).getTime();
    const minutesUntil = (trialStartUtc - Date.now()) / (1000 * 60);
    if (minutesUntil >= 330 && minutesUntil < 390) {
      upcomingTrials.push({ trial: t, cls });
    }
  }

  if (upcomingTrials.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no trials in 5.5h-6.5h window" });
  }

  const recipientTrials = new Map<string, { trial: (typeof trials)[0]; cls: ClsRow }[]>();
  for (const item of upcomingTrials) {
    const coachIds = await resolveTrialRecipients(supabase, item.cls);
    for (const uid of coachIds) {
      const list = recipientTrials.get(uid) || [];
      list.push(item);
      recipientTrials.set(uid, list);
    }
  }

  let sent = 0;
  let skipped = 0;
  for (const [userId, items] of Array.from(recipientTrials)) {
    const lines: string[] = [];
    lines.push("⏰ Trial in ~6h — backstop reminder");
    lines.push("");
    for (const { trial, cls } of items) {
      lines.push(
        `• ${fmtTime(cls.start_time)}–${fmtTime(cls.end_time)} ${cls.name} — ${trial.name} (${trial.phone})`
      );
    }
    const message = lines.join("\n").trim();
    const ok = await sendTelegramPlainToUser(userId, message);
    if (ok) sent += 1;
    else skipped += 1;
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    trials_in_window: upcomingTrials.length,
  });
}
