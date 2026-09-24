/** Shared by the calendar mirror and schedule warnings; all boundaries are SGT. */
export type LeaveInterval = {
  leave_date: string;
  leave_end_date: string | null;
  is_half_day: boolean | null;
  half_day_period?: "morning" | "evening" | null;
  status?: string;
  deleted_at?: string | null;
};

const DAY = 86_400_000;
const HALF_BOUNDARY = (18 * 60 + 30) * 60_000;

/** End-exclusive overlap: finishing exactly as leave starts is allowed. */
export function leaveOverlapsInterval(leave: LeaveInterval, start: number, end: number): boolean {
  if (leave.deleted_at || (leave.status !== undefined && leave.status !== "approved")) return false;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const firstDay = Date.parse(`${leave.leave_date}T00:00:00+08:00`);
  const lastDay = Date.parse(`${leave.leave_end_date || leave.leave_date}T00:00:00+08:00`);
  if (!Number.isFinite(firstDay) || !Number.isFinite(lastDay) || lastDay < firstDay) return false;
  if (start >= lastDay + DAY || end <= firstDay) return false;
  if (!leave.is_half_day) return true;
  // Iterate only days touched by the event, even for a long leave request.
  const firstTouchedDay = firstDay + Math.max(0, Math.floor((start - firstDay) / DAY)) * DAY;
  for (let day = firstTouchedDay; day <= lastDay && day < end; day += DAY) {
    const evening = leave.half_day_period === "evening";
    const leaveStart = day + (evening ? HALF_BOUNDARY : 0);
    const leaveEnd = day + (evening ? DAY : HALF_BOUNDARY);
    if (start < leaveEnd && end > leaveStart) return true;
  }
  return false;
}
