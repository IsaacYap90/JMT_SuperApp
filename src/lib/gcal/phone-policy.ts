import { assertValidPtDuration, parsePtScheduledAt } from "@/lib/pt-schedule";
import type { GCalListedEvent } from "./google-calendar";

/** Last PT version successfully mirrored; never derived from a phone title. */
export interface PtBaseline {
  scheduled_at: string;
  duration_minutes: number;
  coach_id: string;
  member_id: string | null;
  status: string;
  edited_at: string | null;
}

export function phonePtTime(event: GCalListedEvent): { scheduled_at: string; duration_minutes: number } | null {
  // All-day or recurring phone events cannot represent a single PT booking.
  if (event.recurrence?.length || event.recurringEventId || !event.start?.dateTime || !event.end?.dateTime) return null;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(event.start.dateTime)
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(event.end.dateTime)) return null;
  try {
    const start = parsePtScheduledAt(event.start.dateTime);
    const end = parsePtScheduledAt(event.end.dateTime);
    const duration_minutes = (end.getTime() - start.getTime()) / 60_000;
    assertValidPtDuration(duration_minutes);
    return { scheduled_at: start.toISOString(), duration_minutes };
  } catch { return null; }
}

export function phonePtChanged(event: GCalListedEvent, baseline: PtBaseline): boolean {
  if (event.status === "cancelled") return true;
  const time = phonePtTime(event);
  return !!time && (Date.parse(time.scheduled_at) !== Date.parse(baseline.scheduled_at)
    || time.duration_minutes !== baseline.duration_minutes);
}

export function ptBaseline(row: PtBaseline): PtBaseline {
  return {
    scheduled_at: row.scheduled_at,
    duration_minutes: row.duration_minutes,
    coach_id: row.coach_id,
    member_id: row.member_id ?? null,
    status: row.status,
    edited_at: row.edited_at ?? null,
  };
}
