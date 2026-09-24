import type { SupabaseClient } from "@supabase/supabase-js";

type LeaveRow = {
  coach_id: string;
  leave_date: string;
  leave_end_date: string | null;
  is_half_day: boolean;
  half_day_period: "morning" | "evening" | null;
};

type ClassAssignment = {
  day_of_week: string | null;
  event_date: string | null;
  start_time: string;
  end_time: string;
};

const SGT = "+08:00";

function sgtDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const current = new Date(`${start}T00:00:00${SGT}`);
  const finish = new Date(`${end}T00:00:00${SGT}`);
  while (current <= finish) {
    days.push(sgtDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function halfDayRange(day: string, leave: LeaveRow): [Date, Date] {
  const eveningOff = leave.half_day_period === "evening";
  return eveningOff
    ? [new Date(`${day}T18:30:00${SGT}`), new Date(`${day}T24:00:00${SGT}`)]
    : [new Date(`${day}T00:00:00${SGT}`), new Date(`${day}T18:30:00${SGT}`)];
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

async function approvedLeavesForRange(
  admin: SupabaseClient,
  coachIds: string[],
  startDate: string,
  endDate: string
): Promise<LeaveRow[]> {
  if (!coachIds.length) return [];
  const { data, error } = await admin
    .from("leaves")
    .select("coach_id, leave_date, leave_end_date, is_half_day, half_day_period")
    .in("coach_id", coachIds)
    .eq("status", "approved")
    .is("deleted_at", null)
    .lte("leave_date", endDate);
  if (error) throw new Error(`Could not check approved leave: ${error.message}`);
  return (data || []).filter((leave) => (leave.leave_end_date || leave.leave_date) >= startDate);
}

/** Reject a PT if any part of it overlaps an approved leave in Singapore time. */
export async function assertCoachAvailableForPt(
  admin: SupabaseClient,
  coachId: string,
  scheduledAt: Date,
  durationMinutes: number
): Promise<void> {
  const end = new Date(scheduledAt.getTime() + durationMinutes * 60_000);
  const startDate = sgtDate(scheduledAt);
  const endDate = sgtDate(end);
  const leaves = await approvedLeavesForRange(admin, [coachId], startDate, endDate);

  for (const leave of leaves) {
    for (const day of daysBetween(leave.leave_date, leave.leave_end_date || leave.leave_date)) {
      const [leaveStart, leaveEnd] = leave.is_half_day
        ? halfDayRange(day, leave)
        : [new Date(`${day}T00:00:00${SGT}`), new Date(`${day}T24:00:00${SGT}`)];
      if (overlaps(scheduledAt, end, leaveStart, leaveEnd)) {
        throw new Error("Coach is on approved leave at this time. Choose another coach or time.");
      }
    }
  }
}

/** Reject a new class coach assignment when that class occurs during future approved leave. */
export async function assertCoachesAvailableForClass(
  admin: SupabaseClient,
  coachIds: string[],
  assignment: ClassAssignment
): Promise<void> {
  if (!coachIds.length) return;
  const today = sgtDate(new Date());
  const endDate = assignment.event_date || "9999-12-31";
  const leaves = await approvedLeavesForRange(admin, coachIds, today, endDate);
  const start = assignment.start_time.slice(0, 5);
  const end = assignment.end_time.slice(0, 5);

  for (const leave of leaves) {
    const finalDay = leave.leave_end_date || leave.leave_date;
    for (const day of daysBetween(leave.leave_date > today ? leave.leave_date : today, finalDay)) {
      if (assignment.event_date ? assignment.event_date !== day : new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Singapore" }).format(new Date(`${day}T12:00:00${SGT}`)).toLowerCase() !== assignment.day_of_week) continue;
      if (!leave.is_half_day) {
        throw new Error("A selected coach is on approved leave for this class. Choose another coach.");
      }
      const [leaveStart, leaveEnd] = halfDayRange(day, leave);
      const classStart = new Date(`${day}T${start}:00${SGT}`);
      const classEnd = new Date(`${day}T${end}:00${SGT}`);
      if (overlaps(classStart, classEnd, leaveStart, leaveEnd)) {
        throw new Error("A selected coach is on approved leave for this class. Choose another coach.");
      }
    }
  }
}
