// Trial reminder — fires 1 hour before a trial class.
// Runs every 30 minutes via Vercel Cron.
// Uses a time-window approach: alerts for trials whose class starts
// between 30 and 90 minutes from now, so each trial gets exactly one
// reminder per 30-minute cron cycle.
//
// Recipients: coaches assigned to the class + all admins (Jeremy).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";

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
    return NextResponse.json(
      { error: "Supabase env vars missing" },
      { status: 500 }
    );
  }
  const supabase = createClient(url, key);

  // Today in SGT
  const now = new Date();
  const sgString = now.toLocaleString("en-US", { timeZone: "Asia/Singapore" });
  const sg = new Date(sgString);
  const y = sg.getFullYear();
  const m = sg.getMonth() + 1;
  const d = sg.getDate();
  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Current SGT time in minutes since midnight
  const nowMinutes = sg.getHours() * 60 + sg.getMinutes();

  // Today's booked trials
  const { data: trials } = await supabase
    .from("trial_bookings")
    .select("id, name, phone, class_id, booking_date, time_slot, status")
    .eq("booking_date", ymd)
    .eq("status", "booked");

  if (!trials || trials.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no trials today" });
  }

  // Get all classes referenced by today's trials
  const classIds = Array.from(new Set(trials.map((t) => t.class_id)));
  const { data: classes } = await supabase
    .from("classes")
    .select(
      "id, name, start_time, end_time, lead_coach_id, assistant_coach_id, class_coaches(coach_id)"
    )
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
  for (const c of (classes || []) as ClsRow[]) {
    classMap.set(c.id, c);
  }

  // Filter trials whose class starts between 30 and 90 minutes from now
  const upcomingTrials: { trial: (typeof trials)[0]; cls: ClsRow }[] = [];
  for (const t of trials) {
    const cls = classMap.get(t.class_id);
    if (!cls) continue;
    const [hStr, mStr] = cls.start_time.split(":");
    const classMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    const diff = classMinutes - nowMinutes;
    if (diff >= 30 && diff < 90) {
      upcomingTrials.push({ trial: t, cls });
    }
  }

  if (upcomingTrials.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      reason: "no trials in the next 30-90 min window",
    });
  }

  // All admins
  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .in("role", ["admin", "master_admin"])
    .eq("is_active", true)
    .is("merged_into_id", null);
  const adminIds = new Set<string>((admins || []).map((u) => u.id));

  // Group trials by recipient
  const recipientTrials = new Map<
    string,
    { trial: (typeof trials)[0]; cls: ClsRow }[]
  >();

  for (const item of upcomingTrials) {
    const coachIds = new Set<string>();
    if (item.cls.lead_coach_id) coachIds.add(item.cls.lead_coach_id);
    if (item.cls.assistant_coach_id) coachIds.add(item.cls.assistant_coach_id);
    for (const cc of item.cls.class_coaches || []) {
      if (cc.coach_id) coachIds.add(cc.coach_id);
    }
    // Add admins
    Array.from(adminIds).forEach((id) => coachIds.add(id));

    for (const uid of Array.from(coachIds)) {
      const list = recipientTrials.get(uid) || [];
      list.push(item);
      recipientTrials.set(uid, list);
    }
  }

  let sent = 0;
  let skipped = 0;

  for (const [userId, items] of Array.from(recipientTrials)) {
    const lines: string[] = [];
    lines.push("⏰ Trial reminder — coming up soon!");
    lines.push("");
    for (const { trial, cls } of items) {
      lines.push(
        `• ${fmtTime(cls.start_time)}–${fmtTime(cls.end_time)} ${cls.name} — ${trial.name} (${trial.phone})`
      );
    }

    const message = lines.join("\n").trim();
    const ok = await sendTelegramPlainToUser(userId, message);
    if (ok) sent++;
    else skipped++;
  }

  return NextResponse.json({
    ok: true,
    date: ymd,
    trials: upcomingTrials.length,
    recipients: recipientTrials.size,
    sent,
    skipped,
  });
}
