// Nightly 9pm SGT reminder to master_admin(s) listing tomorrow's PT sessions.
// Purpose: prompt Jeremy to cancel/update the OS before coaches leave for work.
//
// Triggered by Vercel Cron at "0 13 * * *" UTC = 21:00 SGT (UTC+8).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tomorrowSg() {
  const now = new Date();
  const sgString = now.toLocaleString("en-US", { timeZone: "Asia/Singapore" });
  const sg = new Date(sgString);
  // Advance by 1 day
  sg.setDate(sg.getDate() + 1);
  const y = sg.getFullYear();
  const m = String(sg.getMonth() + 1).padStart(2, "0");
  const d = String(sg.getDate()).padStart(2, "0");
  const ymd = `${y}-${m}-${d}`;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayLabel = dayNames[sg.getDay()];
  const startUtc = new Date(`${ymd}T00:00:00+08:00`).toISOString();
  const endUtc = new Date(`${ymd}T23:59:59+08:00`).toISOString();
  return { ymd, dayLabel, startUtc, endUtc };
}

function fmtTime(iso: string): string {
  const sg = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  let h = sg.getHours();
  const m = String(sg.getMinutes()).padStart(2, "0");
  const suffix = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m}${suffix}`;
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

  const only = req.nextUrl.searchParams.get("only");
  const { ymd, dayLabel, startUtc, endUtc } = tomorrowSg();

  // Get all master_admin users (Jeremy + any future admins)
  let adminQuery = supabase
    .from("users")
    .select("id, full_name")
    .eq("role", "master_admin")
    .eq("is_active", true)
    .is("merged_into_id", null);
  if (only) adminQuery = adminQuery.eq("id", only);
  const { data: admins } = await adminQuery;

  if (!admins || admins.length === 0) {
    return NextResponse.json({ sent: 0, message: "No master_admin users found" });
  }

  // Fetch tomorrow's PT sessions (not cancelled)
  const { data: ptSessions } = await supabase
    .from("pt_sessions")
    .select(
      "scheduled_at, status, coach:users!pt_sessions_coach_id_fkey(full_name), member:users!pt_sessions_member_id_fkey(full_name)"
    )
    .gte("scheduled_at", startUtc)
    .lte("scheduled_at", endUtc)
    .neq("status", "cancelled")
    .order("scheduled_at");

  // Skip silently if no PT tomorrow
  if (!ptSessions || ptSessions.length === 0) {
    return NextResponse.json({ sent: 0, message: `No PT sessions tomorrow (${ymd})` });
  }

  // Build the message
  const lines: string[] = [
    `Tomorrow's PT — ${dayLabel} ${ymd.slice(5).replace("-", "/")}:`,
    "",
  ];
  for (const s of ptSessions) {
    const time = fmtTime(s.scheduled_at);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const member = (s.member as any)?.full_name || "Client";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coach = (s.coach as any)?.full_name || "Coach";
    lines.push(`• ${time} — ${member} (${coach})`);
  }
  lines.push("");
  lines.push("Please update the OS tonight if any cancellations.");

  const message = lines.join("\n");

  // Send to each master_admin
  let sent = 0;
  for (const admin of admins) {
    try {
      await sendTelegramPlainToUser(admin.id, message);
      sent++;
    } catch (err) {
      console.error(`PM reminder failed for ${admin.full_name}:`, err);
    }
  }

  return NextResponse.json({ sent, sessions: ptSessions.length, date: ymd });
}
