// Trial reminder — fires 24 hours before a trial class.
// Runs every 30 minutes via Vercel Cron.
// Window: trials whose class starts between 23.5h and 24.5h from now.
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
    return NextResponse.json({ error: "Supabase env vars missing" }, { status: 500 });
  }
  const supabase = createClient(url, key);

  // Tomorrow in SGT
  const now = new Date();
  const sgString = now.toLocaleString("en-US", { timeZone: "Asia/Singapore" });
  const sg = new Date(sgString);
  const tomorrow = new Date(sg);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = tomorrow.getMonth() + 1;
  const d = tomorrow.getDate();
  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const nowMinutes = sg.getHours() * 60 + sg.getMinutes();

  const { data: trials } = await supabase
    .from("trial_bookings")
    .select("id, name, phone, class_id, booking_date, time_slot, status")
    .eq("booking_date", ymd)
    .eq("status", "booked");

  if (!trials || trials.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no trials tomorrow" });
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

  // Window: class starts between 23.5h and 24.5h from now.
  // For a trial tomorrow at start_time, minutes-until-start = 1440 + (classMins - nowMins).
  // Fire if that is in [1410, 1470).
  const upcomingTrials: { trial: (typeof trials)[0]; cls: ClsRow }[] = [];
  for (const t of trials) {
    const cls = classMap.get(t.class_id);
    if (!cls) continue;
    const [hStr, mStr] = cls.start_time.split(":");
    const classMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    const diff = 1440 + (classMinutes - nowMinutes);
    if (diff >= 1410 && diff < 1470) {
      upcomingTrials.push({ trial: t, cls });
    }
  }

  if (upcomingTrials.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no trials in 23.5h-24.5h window" });
  }

  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .in("role", ["admin", "master_admin"])
    .eq("is_active", true);
  const adminIds = new Set<string>((admins || []).map((u) => u.id));

  const recipientTrials = new Map<string, { trial: (typeof trials)[0]; cls: ClsRow }[]>();

  for (const item of upcomingTrials) {
    const coachIds = new Set<string>();
    if (item.cls.lead_coach_id) coachIds.add(item.cls.lead_coach_id);
    if (item.cls.assistant_coach_id) coachIds.add(item.cls.assistant_coach_id);
    for (const cc of item.cls.class_coaches || []) {
      if (cc.coach_id) coachIds.add(cc.coach_id);
    }
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
    lines.push("📅 Trial tomorrow — 24h heads up");
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
