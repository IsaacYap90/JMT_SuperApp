import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SG_HOLIDAYS } from "@/lib/sg-holidays";

const DAYS_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_TO_BYDAY: Record<string, string> = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function escapeIcs(text: string): string {
  return text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

// Local (SGT) ICS datetime string — meant to be used with TZID=Asia/Singapore
function toLocalIcs(y: number, m: number, d: number, h: number, min: number): string {
  return `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(min)}00`;
}

function parseYmd(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
}

// First occurrence of `dayOfWeek` on or after `startYmd`, skipping SG public holidays.
function firstOccurrenceOnOrAfter(startYmd: string, dayOfWeek: string): [number, number, number] {
  const [y, m, d] = parseYmd(startYmd);
  const date = new Date(Date.UTC(y, m - 1, d));
  const target = DAYS_ORDER.indexOf(dayOfWeek);
  let daysUntil = target - date.getUTCDay();
  if (daysUntil < 0) daysUntil += 7;
  date.setUTCDate(date.getUTCDate() + daysUntil);
  // Push past any holiday landing on the anchor itself
  while (true) {
    const ymd = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    if (!SG_HOLIDAYS.find((h) => h.date === ymd)) {
      return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    }
    date.setUTCDate(date.getUTCDate() + 7);
  }
}

// Convert a UTC Date to its SGT wall-clock components
function sgtParts(utc: Date): { y: number; m: number; d: number; h: number; min: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utc);
  const parts: Record<string, string> = {};
  for (const p of fmt) parts[p.type] = p.value;
  // Intl can emit "24" for midnight in some locales — normalise
  const hRaw = parts.hour === "24" ? "00" : parts.hour;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(hRaw),
    min: Number(parts.minute),
  };
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("id");
  const isAdminMode = req.nextUrl.searchParams.get("admin") === "1";

  if (!userId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // User name for calendar title
  const { data: userProfile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();

  if (!userProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Active classes (include created_at for the RRULE DTSTART anchor)
  const { data: allClasses } = await supabase
    .from("classes")
    .select(
      "*, lead_coach:users!classes_lead_coach_id_fkey(full_name), assistant_coach:users!classes_assistant_coach_id_fkey(full_name), class_coaches(*, coach:users(full_name))"
    )
    .eq("is_active", true)
    .order("start_time");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let myClasses: any[];
  if (isAdminMode) {
    myClasses = allClasses || [];
  } else {
    const { data: classCoachLinks } = await supabase
      .from("class_coaches")
      .select("class_id")
      .eq("coach_id", userId);

    const classCoachIds = new Set((classCoachLinks || []).map((cc: { class_id: string }) => cc.class_id));

    myClasses = (allClasses || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) =>
        c.lead_coach_id === userId ||
        c.assistant_coach_id === userId ||
        classCoachIds.has(c.id)
    );
  }

  // PT sessions — ALL history + all future, single VEVENT each.
  // Status filter already excludes cancelled / no_show.
  let ptQuery = supabase
    .from("pt_sessions")
    .select(
      "*, member:users!pt_sessions_member_id_fkey(full_name), coach:users!pt_sessions_coach_id_fkey(full_name)"
    )
    .in("status", ["scheduled", "confirmed", "completed"])
    .order("scheduled_at");

  if (!isAdminMode) {
    ptQuery = ptQuery.eq("coach_id", userId);
  }

  const { data: ptSessions } = await ptQuery;

  // Approved leaves for the coaches involved — used for FUTURE EXDATEs only.
  // Per Isaac: past is past (phantom past classes on leave dates are acceptable);
  // only future coach-on-leave dates get excluded.
  const leaveCoachIds = new Set<string>();
  for (const c of myClasses) {
    if (c.lead_coach_id) leaveCoachIds.add(c.lead_coach_id);
    if (c.assistant_coach_id) leaveCoachIds.add(c.assistant_coach_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const cc of c.class_coaches || []) {
      if (cc.coach_id) leaveCoachIds.add(cc.coach_id);
    }
  }

  const { data: approvedLeaves } =
    leaveCoachIds.size > 0
      ? await supabase
          .from("leaves")
          .select("coach_id, leave_date, leave_end_date, is_half_day")
          .eq("status", "approved")
          .in("coach_id", Array.from(leaveCoachIds))
      : { data: [] as Array<{ coach_id: string; leave_date: string; leave_end_date: string | null; is_half_day: boolean }> };

  // "Today" in SGT as a UTC midnight Date so we can compare with date-only objects
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const [ty, tm, td] = parseYmd(todayStr);
  const todayUtc = new Date(Date.UTC(ty, tm - 1, td));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JAI Muay Thai//Dashboard//EN",
    `X-WR-CALNAME:JAI - ${escapeIcs(userProfile.full_name)}${isAdminMode ? " (All)" : ""}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-PUBLISHED-TTL:PT30M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    // Singapore timezone definition — no DST, constant +08:00.
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Singapore",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:SGT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  // One VEVENT per class with RRULE (infinite weekly recurrence) + EXDATE (holidays + future leaves).
  for (const cls of myClasses) {
    if (!DAY_TO_BYDAY[cls.day_of_week]) continue;
    if (!cls.created_at) continue;
    if (!cls.start_time || !cls.end_time) continue;

    const createdYmd: string = cls.created_at.slice(0, 10);
    const [anchorY, anchorM, anchorD] = firstOccurrenceOnOrAfter(createdYmd, cls.day_of_week);
    const anchorUtc = new Date(Date.UTC(anchorY, anchorM - 1, anchorD));

    const [startH, startM] = cls.start_time.split(":").map(Number);
    const [endH, endM] = cls.end_time.split(":").map(Number);

    const dtstart = toLocalIcs(anchorY, anchorM, anchorD, startH, startM);
    const dtend = toLocalIcs(anchorY, anchorM, anchorD, endH, endM);
    const byday = DAY_TO_BYDAY[cls.day_of_week];

    const coaches = [
      cls.lead_coach?.full_name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(cls.class_coaches?.filter((cc: any) => !cc.is_lead && cc.coach).map((cc: any) => cc.coach.full_name) || []),
    ]
      .filter(Boolean)
      .join(", ");

    const exdateTimes: string[] = [];

    // 1. Public holidays (past + future) that fall on this class's day_of_week, from anchor forward.
    for (const holiday of SG_HOLIDAYS) {
      const [hy, hm, hd] = parseYmd(holiday.date);
      const hDate = new Date(Date.UTC(hy, hm - 1, hd));
      if (hDate < anchorUtc) continue;
      if (DAYS_ORDER[hDate.getUTCDay()] !== cls.day_of_week) continue;
      exdateTimes.push(toLocalIcs(hy, hm, hd, startH, startM));
    }

    // 2. Future approved leaves affecting any assigned coach on this class.
    const affectedCoachIds = new Set<string>(
      [
        cls.lead_coach_id,
        cls.assistant_coach_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(cls.class_coaches?.map((cc: any) => cc.coach_id) || []),
      ].filter(Boolean) as string[]
    );

    const classStartHHMM = cls.start_time.slice(0, 5); // "HH:MM"

    for (const leave of approvedLeaves || []) {
      if (!affectedCoachIds.has(leave.coach_id)) continue;
      // Half-day rule (JMT): half-day = off before 6:30pm, evening classes still run.
      if (leave.is_half_day && classStartHHMM >= "18:30") continue;

      const [lsY, lsM, lsD] = parseYmd(leave.leave_date);
      const endYmd = leave.leave_end_date || leave.leave_date;
      const [leY, leM, leD] = parseYmd(endYmd);
      const rangeStart = new Date(Date.UTC(lsY, lsM - 1, lsD));
      const rangeEnd = new Date(Date.UTC(leY, leM - 1, leD));

      // Iterate each day in the leave range, emit EXDATE only for FUTURE dates (>= today)
      // that match this class's day_of_week.
      const iter = new Date(rangeStart);
      while (iter <= rangeEnd) {
        if (
          iter >= todayUtc &&
          iter >= anchorUtc &&
          DAYS_ORDER[iter.getUTCDay()] === cls.day_of_week
        ) {
          exdateTimes.push(
            toLocalIcs(
              iter.getUTCFullYear(),
              iter.getUTCMonth() + 1,
              iter.getUTCDate(),
              startH,
              startM
            )
          );
        }
        iter.setUTCDate(iter.getUTCDate() + 1);
      }
    }

    const uniqueExdates = Array.from(new Set(exdateTimes)).sort();

    lines.push(
      "BEGIN:VEVENT",
      `UID:class-${cls.id}@jaimuaythai`,
      `DTSTART;TZID=Asia/Singapore:${dtstart}`,
      `DTEND;TZID=Asia/Singapore:${dtend}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
      `SUMMARY:${escapeIcs(cls.name)}`,
      `DESCRIPTION:${escapeIcs(`Class · ${coaches}`)}`,
      "CATEGORIES:Class"
    );
    if (uniqueExdates.length > 0) {
      // One EXDATE line per date — maximum client compatibility vs a long comma-joined line.
      for (const ex of uniqueExdates) {
        lines.push(`EXDATE;TZID=Asia/Singapore:${ex}`);
      }
    }
    lines.push("END:VEVENT");
  }

  // Base URL for deep-linking calendar events back into the dashboard.
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`).replace(/\/$/, "");

  // PT sessions — one VEVENT each, all history + all future.
  for (const pt of ptSessions || []) {
    if (!pt.scheduled_at) continue;
    const startUtc = new Date(pt.scheduled_at);
    if (isNaN(startUtc.getTime())) continue;
    const endUtc = new Date(startUtc.getTime() + (pt.duration_minutes || 60) * 60000);

    const s = sgtParts(startUtc);
    const e = sgtParts(endUtc);

    const clientName = pt.member?.full_name || "Client";
    const logUrl = `${baseUrl}/pt/log/${pt.id}`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:pt-${pt.id}@jaimuaythai`,
      `DTSTART;TZID=Asia/Singapore:${toLocalIcs(s.y, s.m, s.d, s.h, s.min)}`,
      `DTEND;TZID=Asia/Singapore:${toLocalIcs(e.y, e.m, e.d, e.h, e.min)}`,
      `SUMMARY:PT — ${escapeIcs(clientName)}`,
      `DESCRIPTION:${escapeIcs(
        `PT Session · ${pt.duration_minutes || 60}min${pt.coach?.full_name ? ` · ${pt.coach.full_name}` : ""}\n\nTap to log session → ${logUrl}`
      )}`,
      `URL:${logUrl}`,
      "CATEGORIES:PT",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="jai-schedule.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
