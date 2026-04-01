import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPublicHoliday } from "@/lib/sg-holidays";

const DAYS_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toIcsDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

function escapeIcs(text: string): string {
  return text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
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

  // Fetch user name
  const { data: userProfile } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();

  if (!userProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch classes
  const { data: allClasses } = await supabase
    .from("classes")
    .select("*, lead_coach:users!classes_lead_coach_id_fkey(full_name), assistant_coach:users!classes_assistant_coach_id_fkey(full_name), class_coaches(*, coach:users(full_name))")
    .eq("is_active", true)
    .order("start_time");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let myClasses: any[];
  if (isAdminMode) {
    // Admin sees all classes
    myClasses = allClasses || [];
  } else {
    // Coach sees only their assigned classes
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

  // Fetch PT sessions (next 8 weeks)
  const now = new Date();
  const futureDate = new Date(now.getTime() + 56 * 86400000);
  const nowStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const futureStr = futureDate.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

  let ptQuery = supabase
    .from("pt_sessions")
    .select("*, member:users!pt_sessions_member_id_fkey(full_name), coach:users!pt_sessions_coach_id_fkey(full_name)")
    .gte("scheduled_at", nowStr)
    .lt("scheduled_at", futureStr)
    .in("status", ["scheduled", "confirmed", "completed"])
    .order("scheduled_at");

  if (!isAdminMode) {
    ptQuery = ptQuery.eq("coach_id", userId);
  }

  const { data: ptSessions } = await ptQuery;

  // Build ICS
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JAI Muay Thai//Dashboard//EN",
    `X-WR-CALNAME:JAI - ${escapeIcs(userProfile.full_name)}${isAdminMode ? " (All)" : ""}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // Refresh every 6 hours
    "X-PUBLISHED-TTL:PT6H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];

  // Generate recurring class events for the next 8 weeks
  const sgtNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  sgtNow.setHours(0, 0, 0, 0);

  for (const cls of myClasses) {
    const dayIdx = DAYS_ORDER.indexOf(cls.day_of_week);
    if (dayIdx === -1) continue;

    // Find the next occurrence of this day
    const currentDay = sgtNow.getDay();
    let daysUntil = dayIdx - currentDay;
    if (daysUntil < 0) daysUntil += 7;

    // Generate 8 weekly occurrences
    for (let week = 0; week < 8; week++) {
      const classDate = new Date(sgtNow);
      classDate.setDate(sgtNow.getDate() + daysUntil + week * 7);

      // Skip public holidays
      const classDateStr = `${classDate.getFullYear()}-${pad(classDate.getMonth() + 1)}-${pad(classDate.getDate())}`;
      if (isPublicHoliday(classDateStr)) continue;

      const [startH, startM] = cls.start_time.split(":").map(Number);
      const [endH, endM] = cls.end_time.split(":").map(Number);

      // Create dates in SGT then convert to UTC
      const startUtc = new Date(classDate);
      startUtc.setHours(startH, startM, 0, 0);
      // SGT is UTC+8
      startUtc.setTime(startUtc.getTime() - 8 * 3600000);

      const endUtc = new Date(classDate);
      endUtc.setHours(endH, endM, 0, 0);
      endUtc.setTime(endUtc.getTime() - 8 * 3600000);

      const coaches = [
        cls.lead_coach?.full_name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(cls.class_coaches?.filter((cc: any) => !cc.is_lead && cc.coach).map((cc: any) => (cc as any).coach.full_name) || []),
      ].filter(Boolean).join(", ");

      lines.push(
        "BEGIN:VEVENT",
        `UID:class-${cls.id}-${classDate.toISOString().split("T")[0]}@jaimuaythai`,
        `DTSTART:${toIcsDate(startUtc)}`,
        `DTEND:${toIcsDate(endUtc)}`,
        `SUMMARY:${escapeIcs(cls.name)}`,
        `DESCRIPTION:${escapeIcs(`Class · ${coaches}`)}`,
        "CATEGORIES:Class",
        "END:VEVENT"
      );
    }
  }

  // Add PT sessions
  for (const pt of ptSessions || []) {
    const startUtc = new Date(pt.scheduled_at);
    const endUtc = new Date(startUtc.getTime() + (pt.duration_minutes || 60) * 60000);
    const clientName = pt.member?.full_name || "Client";

    lines.push(
      "BEGIN:VEVENT",
      `UID:pt-${pt.id}@jaimuaythai`,
      `DTSTART:${toIcsDate(startUtc)}`,
      `DTEND:${toIcsDate(endUtc)}`,
      `SUMMARY:PT — ${escapeIcs(clientName)}`,
      `DESCRIPTION:${escapeIcs(`PT Session · ${pt.duration_minutes || 60}min${pt.coach?.full_name ? ` · ${pt.coach.full_name}` : ""}`)}`,
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
