// Daily 6am SGT schedule alert.
// Each coach/admin gets a 1:1 Telegram DM listing their day's classes,
// PT sessions, and who is on approved leave today.
//
// Triggered by Vercel Cron at "0 22 * * *" UTC = 06:00 SGT/MYT (UTC+8).
// Vercel attaches `Authorization: Bearer ${CRON_SECRET}` automatically when
// CRON_SECRET is set in the project's env vars.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Isaac is always "assistant" on every class, so the role suffix is just noise
// in his personal schedule. Other coaches still see lead/assistant/coach
// labels because their roles vary per class.
const HIDE_ROLE_USER_IDS = new Set<string>([
  "d8918b90-b0b1-4064-83bc-2bc80a44d516", // Isaac Yap
]);

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// Today in Asia/Singapore as { ymd, dayOfWeek, startUtc, endUtc }
function todaySg() {
  const now = new Date();
  const sgString = now.toLocaleString("en-US", { timeZone: "Asia/Singapore" });
  const sg = new Date(sgString);
  const y = sg.getFullYear();
  const m = sg.getMonth() + 1;
  const d = sg.getDate();
  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dayOfWeek = DAY_NAMES[sg.getDay()];
  // SGT midnight → next-day midnight in UTC ISO strings, for PT session range
  const startUtc = new Date(`${ymd}T00:00:00+08:00`).toISOString();
  const endUtc = new Date(`${ymd}T23:59:59+08:00`).toISOString();
  return { ymd, dayOfWeek, startUtc, endUtc };
}

function fmtTime(hhmm: string): string {
  // "19:00:00" → "7:00pm"
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${suffix}`;
}

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron sends Bearer token. Locally, allow if no secret set
  // OR if the matching secret is provided.
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

  // Optional debug filter — ?only=<userId> sends to just that staff member
  const only = req.nextUrl.searchParams.get("only");

  const { ymd, dayOfWeek, startUtc, endUtc } = todaySg();

  // 1. All staff (coaches + admins, active). If ?only= passed, filter to that id.
  let staffQuery = supabase
    .from("users")
    .select("id, full_name, role")
    .in("role", ["coach", "admin", "master_admin"])
    .eq("is_active", true);
  if (only) staffQuery = staffQuery.eq("id", only);
  const { data: staff } = await staffQuery;

  if (!staff || staff.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no staff" });
  }

  // 2. Today's recurring classes (this day_of_week, active) with all coach links
  const { data: classes } = await supabase
    .from("classes")
    .select(
      "id, name, start_time, end_time, lead_coach_id, assistant_coach_id, class_coaches(coach_id)"
    )
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true)
    .order("start_time");

  // 3. Cancelled session overrides for today, so we don't list cancelled classes
  const { data: cancelled } = await supabase
    .from("class_sessions")
    .select("class_id")
    .eq("session_date", ymd)
    .eq("status", "cancelled");
  const cancelledIds = new Set<string>(
    (cancelled || []).map((c) => c.class_id)
  );

  // 4. Today's PT sessions (not cancelled)
  const { data: ptSessions } = await supabase
    .from("pt_sessions")
    .select("id, scheduled_at, coach_id, member_id, status, member:users!pt_sessions_member_id_fkey(full_name)")
    .gte("scheduled_at", startUtc)
    .lte("scheduled_at", endUtc)
    .neq("status", "cancelled")
    .order("scheduled_at");

  // 5. Approved leaves covering today
  const { data: leaves } = await supabase
    .from("leaves")
    .select("coach_id, leave_type, is_half_day, coach:users!leaves_coach_id_fkey(full_name)")
    .eq("status", "approved")
    .lte("leave_date", ymd)
    .gte("leave_end_date", ymd);

  const onLeaveIds = new Set<string>((leaves || []).map((l) => l.coach_id));
  const onLeaveSummary =
    (leaves || [])
      .map((l) => {
        const name =
          (l.coach as unknown as { full_name?: string } | null)?.full_name ||
          "Coach";
        const tag = l.is_half_day
          ? `${l.leave_type} (half day)`
          : l.leave_type;
        return `• ${name} — ${tag}`;
      })
      .join("\n") || null;

  // Build per-user payload
  const prettyDate = new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString(
    "en-SG",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Asia/Singapore",
    }
  );

  type ClsRow = {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    lead_coach_id: string | null;
    assistant_coach_id: string | null;
    class_coaches: { coach_id: string }[] | null;
  };

  let sent = 0;
  let skipped = 0;

  for (const u of staff) {
    // If this person is on full-day leave, send a "rest day" note instead
    const myLeave = (leaves || []).find((l) => l.coach_id === u.id);
    const isFullDayLeave = myLeave && !myLeave.is_half_day;

    // Their classes today
    const myClasses: ClsRow[] = [];
    for (const c of (classes || []) as ClsRow[]) {
      if (cancelledIds.has(c.id)) continue;
      const coachIds = new Set<string>();
      if (c.lead_coach_id) coachIds.add(c.lead_coach_id);
      if (c.assistant_coach_id) coachIds.add(c.assistant_coach_id);
      for (const cc of c.class_coaches || []) {
        if (cc.coach_id) coachIds.add(cc.coach_id);
      }
      if (coachIds.has(u.id)) myClasses.push(c);
    }

    // Their PT sessions today
    const myPt = (ptSessions || []).filter((p) => p.coach_id === u.id);

    // Build message body
    const lines: string[] = [];
    lines.push(`Good morning ${u.full_name?.split(" ")[0] || ""}`.trim() + "!");
    lines.push(prettyDate);
    lines.push("");

    if (isFullDayLeave) {
      lines.push(`You're on ${myLeave!.leave_type} leave today. Enjoy the rest day 🌴`);
    } else {
      // Half-day rule (JMT): off before 6:30pm, teaching evening.
      // When on approved half-day leave, drop classes/PT that start before 18:30.
      const isHalfDayLeave = !!(myLeave && myLeave.is_half_day);
      if (isHalfDayLeave) {
        lines.push(
          `You're on ${myLeave!.leave_type} half day today — evening only (6:30pm onwards).`
        );
        lines.push("");
      }

      // Merge classes + PT into a single time-ordered list (overview tab style)
      type Item = { sortKey: string; line: string };
      const items: Item[] = [];

      const hideRole = HIDE_ROLE_USER_IDS.has(u.id);
      for (const c of myClasses) {
        if (isHalfDayLeave && c.start_time < "18:30:00") continue;
        const role =
          c.lead_coach_id === u.id
            ? "lead"
            : c.assistant_coach_id === u.id
            ? "assistant"
            : "coach";
        const suffix = hideRole ? "" : ` (${role})`;
        items.push({
          sortKey: c.start_time,
          line: `• ${fmtTime(c.start_time)}–${fmtTime(c.end_time)} ${c.name}${suffix}`,
        });
      }

      for (const p of myPt) {
        const dt = new Date(p.scheduled_at);
        const hhmm = dt.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Singapore",
        });
        if (isHalfDayLeave && hhmm < "18:30") continue;
        const memberName =
          (p.member as unknown as { full_name?: string } | null)?.full_name ||
          "Client";
        items.push({
          sortKey: `${hhmm}:00`,
          line: `• ${fmtTime(`${hhmm}:00`)} PT with ${memberName}`,
        });
      }

      items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      if (items.length > 0) {
        for (const it of items) lines.push(it.line);
        lines.push("");
      } else {
        lines.push("No classes or PT sessions today.");
        lines.push("");
      }
    }

    // Who's on leave (only show others, not yourself)
    const otherLeave = (leaves || []).filter((l) => l.coach_id !== u.id);
    if (otherLeave.length > 0) {
      lines.push("On leave today:");
      for (const l of otherLeave) {
        const name =
          (l.coach as unknown as { full_name?: string } | null)?.full_name ||
          "Coach";
        const tag = l.is_half_day
          ? `${l.leave_type} (half day)`
          : l.leave_type;
        lines.push(`• ${name} — ${tag}`);
      }
    }

    // Header line first, then body. Plain text — no markdown escaping needed.
    const message = ["📅 Today's schedule", ...lines].join("\n").trim();

    const ok = await sendTelegramPlainToUser(u.id, message);
    if (ok) sent++;
    else skipped++;
  }

  return NextResponse.json({
    ok: true,
    date: ymd,
    day: dayOfWeek,
    staff: staff.length,
    classes: (classes || []).length,
    cancelled: cancelledIds.size,
    pt: (ptSessions || []).length,
    onLeave: onLeaveIds.size,
    onLeaveSummary,
    sent,
    skipped,
  });
}
