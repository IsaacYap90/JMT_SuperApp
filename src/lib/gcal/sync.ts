/**
 * Google Calendar sync engine.
 *
 * Reads assigned classes, PT sessions, and approved leaves for a coach,
 * then creates/updates/deletes events on the coach's JMT Schedule
 * secondary calendar. Idempotent via gcal_event_map.
 *
 * One-way mirror: JMT OS → Google. Never reads back from Google.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { SG_HOLIDAYS } from "@/lib/sg-holidays";
import {
  insertEvent,
  updateEvent,
  deleteEvent,
  createSecondaryCalendar,
  type GCalEvent,
  type GCalEventTime,
} from "./google-calendar";
import {
  getValidAccessToken,
  setCalendarId,
  markSynced,
  type GCalConnection,
} from "./connection";

const CALENDAR_NAME = "JMT Schedule";
const TZ = "Asia/Singapore";

// ── helpers ──

function sgtDatetime(dateStr: string, timeStr: string): string {
  // dateStr = "YYYY-MM-DD", timeStr = "HH:MM" or "HH:MM:SS"
  return `${dateStr}T${timeStr.length === 5 ? timeStr + ":00" : timeStr}`;
}

function sgtTime(dt: GCalEventTime): GCalEventTime {
  return { ...dt, timeZone: TZ };
}

function utcToSgt(utcIso: string): { date: string; time: string } {
  const d = new Date(utcIso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  const h = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${h}:${parts.minute}:${parts.second}`,
  };
}

/** Upcoming weekday dates for a given day_of_week from today, up to `weeks` ahead. */
function upcomingDates(dayOfWeek: string, weeks: number): string[] {
  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = DAYS.indexOf(dayOfWeek);
  if (target < 0) return [];

  const now = new Date();
  const sgtNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const today = new Date(sgtNow.getFullYear(), sgtNow.getMonth(), sgtNow.getDate());

  let daysUntil = target - today.getDay();
  if (daysUntil < 0) daysUntil += 7;
  const first = new Date(today);
  first.setDate(today.getDate() + daysUntil);

  const dates: string[] = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i * 7);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dates.push(ymd);
  }
  return dates;
}

// ── data fetchers ──

interface ClassRow {
  id: string;
  name: string;
  day_of_week: string | null;
  event_date: string | null;
  start_time: string;
  end_time: string;
  is_active: boolean;
  lead_coach_id: string | null;
  assistant_coach_id: string | null;
  updated_at?: string | null;
  created_at: string;
}

interface PtRow {
  id: string;
  coach_id: string;
  member_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  updated_at?: string | null;
  created_at: string;
  member?: { full_name: string } | null;
}

interface LeaveRow {
  id: string;
  coach_id: string;
  leave_date: string;
  leave_end_date: string | null;
  leave_type: string;
  is_half_day: boolean;
  half_day_period?: string | null;
  status: string;
}

async function fetchCoachClasses(userId: string): Promise<ClassRow[]> {
  const sb = createAdminClient();
  const { data: allClasses, error: classesError } = await sb
    .from("classes")
    .select("id, name, day_of_week, event_date, start_time, end_time, is_active, lead_coach_id, assistant_coach_id, created_at")
    .eq("is_active", true);
  if (classesError) throw new Error(`Failed to read classes for Google Calendar sync: ${classesError.message}`);

  const { data: ccLinks, error: linksError } = await sb
    .from("class_coaches")
    .select("class_id")
    .eq("coach_id", userId);
  if (linksError) throw new Error(`Failed to read class coaches for Google Calendar sync: ${linksError.message}`);

  const ccIds = new Set((ccLinks || []).map((l: { class_id: string }) => l.class_id));

  return (allClasses || []).filter(
    (c: ClassRow) =>
      c.lead_coach_id === userId ||
      c.assistant_coach_id === userId ||
      ccIds.has(c.id)
  );
}

async function fetchCoachPt(userId: string): Promise<PtRow[]> {
  const sb = createAdminClient();
  // Only future + recent past (2 weeks back) to keep the sync window manageable
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data, error } = await sb
    .from("pt_sessions")
    .select("id, coach_id, member_id, scheduled_at, duration_minutes, status, created_at, member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("coach_id", userId)
    .in("status", ["scheduled", "confirmed", "completed"])
    .gte("scheduled_at", twoWeeksAgo);
  if (error) throw new Error(`Failed to read PT sessions for Google Calendar sync: ${error.message}`);
  // Supabase returns the FK join as an array; normalize to single object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[]).map((row) => ({
    ...row,
    member: Array.isArray(row.member) ? row.member[0] || null : row.member,
  })) as PtRow[];
}

async function fetchCoachLeaves(userId: string): Promise<LeaveRow[]> {
  const sb = createAdminClient();
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const { data, error } = await sb
    .from("leaves")
    .select("id, coach_id, leave_date, leave_end_date, leave_type, is_half_day, half_day_period, status")
    .eq("coach_id", userId)
    .eq("status", "approved")
    .is("deleted_at", null)
    .gte("leave_date", todayStr);
  if (error) throw new Error(`Failed to read leave for Google Calendar sync: ${error.message}`);
  return (data || []) as LeaveRow[];
}

// ── event map helpers ──

interface EventMapRow {
  id: string;
  local_entity_key: string;
  google_event_id: string | null;
  synced_at: string | null;
  deleted: boolean;
}

async function getEventMap(connectionId: string): Promise<Map<string, EventMapRow>> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gcal_event_map")
    .select("id, local_entity_key, google_event_id, synced_at, deleted")
    .eq("connection_id", connectionId);
  if (error) throw new Error(`Failed to read Google Calendar event map: ${error.message}`);
  const map = new Map<string, EventMapRow>();
  for (const row of data || []) {
    map.set(row.local_entity_key, row as EventMapRow);
  }
  return map;
}

async function upsertEventMap(
  connectionId: string,
  key: string,
  googleEventId: string,
  deleted: boolean = false
): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from("gcal_event_map").upsert(
    {
      connection_id: connectionId,
      local_entity_key: key,
      google_event_id: googleEventId,
      synced_at: new Date().toISOString(),
      local_updated_at: new Date().toISOString(),
      deleted,
    },
    { onConflict: "connection_id,local_entity_key" }
  );
  if (error) throw new Error(`Failed to persist Google Calendar event map: ${error.message}`);
}

// ── main sync ──

/** Holiday dates as a Set for quick lookup */
const holidaySet = new Set(SG_HOLIDAYS.map((h) => h.date));

/** How many weeks ahead to expand recurring classes into individual Google events. */
const CLASS_HORIZON_WEEKS = 8;

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

/**
 * Full sync for one coach. Idempotent: safe to retry on failure.
 */
export async function syncCoach(conn: GCalConnection): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(conn.id);
  } catch (err) {
    result.errors.push(`Token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  // Ensure the app-owned secondary calendar exists. With calendar.app.created
  // scope we cannot list/search calendars — only access ones THIS app created.
  // The calendar ID is stored in gcal_connections on first creation.
  let calId = conn.google_calendar_id;
  if (!calId) {
    try {
      calId = await createSecondaryCalendar(accessToken, CALENDAR_NAME);
      await setCalendarId(conn.id, calId);
    } catch (err) {
      result.errors.push(`Failed to create calendar: ${err instanceof Error ? err.message : String(err)}`);
      return result;
    }
  }

  const eventMap = await getEventMap(conn.id);
  const wantedKeys = new Set<string>();

  // ── 1. Classes: expand recurring classes into individual weekly events ──

  const classes = await fetchCoachClasses(conn.user_id);
  const leaves = await fetchCoachLeaves(conn.user_id);

  for (const cls of classes) {
    if (cls.event_date) {
      // One-off class
      const key = `class:${cls.id}`;
      wantedKeys.add(key);
      const event: GCalEvent = {
        summary: cls.name,
        description: "One-off class",
        start: sgtTime({ dateTime: sgtDatetime(cls.event_date, cls.start_time), timeZone: TZ }),
        end: sgtTime({ dateTime: sgtDatetime(cls.event_date, cls.end_time), timeZone: TZ }),
        extendedProperties: { private: { jmt_key: key } },
      };
      await syncOneEvent(accessToken, calId, conn.id, key, event, eventMap, result);
    } else if (cls.day_of_week) {
      // Recurring: expand into individual events for the next N weeks
      const dates = upcomingDates(cls.day_of_week, CLASS_HORIZON_WEEKS);
      const classStartHHMM = cls.start_time.slice(0, 5);

      for (const date of dates) {
        // Skip holidays
        if (holidaySet.has(date)) continue;

        // Skip if any coach leave covers this date
        let onLeave = false;
        for (const leave of leaves) {
          if (leave.coach_id !== conn.user_id) continue;
          const leaveEnd = leave.leave_end_date || leave.leave_date;
          if (date >= leave.leave_date && date <= leaveEnd) {
            if (leave.is_half_day) {
              const period = leave.half_day_period || "morning";
              if (period === "morning" && classStartHHMM >= "18:30") continue;
              if (period === "evening" && classStartHHMM < "18:30") continue;
            }
            onLeave = true;
            break;
          }
        }
        if (onLeave) continue;

        const key = `class:${cls.id}:${date}`;
        wantedKeys.add(key);
        const event: GCalEvent = {
          summary: cls.name,
          description: `Class`,
          start: sgtTime({ dateTime: sgtDatetime(date, cls.start_time), timeZone: TZ }),
          end: sgtTime({ dateTime: sgtDatetime(date, cls.end_time), timeZone: TZ }),
          extendedProperties: { private: { jmt_key: key } },
        };
        await syncOneEvent(accessToken, calId, conn.id, key, event, eventMap, result);
      }
    }
  }

  // ── 2. PT sessions ──

  const ptSessions = await fetchCoachPt(conn.user_id);
  for (const pt of ptSessions) {
    const key = `pt:${pt.id}`;
    wantedKeys.add(key);
    const start = utcToSgt(pt.scheduled_at);
    const endUtc = new Date(new Date(pt.scheduled_at).getTime() + (pt.duration_minutes || 60) * 60_000);
    const end = utcToSgt(endUtc.toISOString());
    const clientName = pt.member?.full_name || "Client";

    const event: GCalEvent = {
      summary: `PT — ${clientName}`,
      description: `PT Session · ${pt.duration_minutes || 60}min`,
      start: sgtTime({ dateTime: sgtDatetime(start.date, start.time), timeZone: TZ }),
      end: sgtTime({ dateTime: sgtDatetime(end.date, end.time), timeZone: TZ }),
      extendedProperties: { private: { jmt_key: key } },
    };
    await syncOneEvent(accessToken, calId, conn.id, key, event, eventMap, result);
  }

  // ── 3. Leave events (coach sees their own leave on the calendar) ──

  for (const leave of leaves) {
    if (leave.coach_id !== conn.user_id) continue;
    const key = `leave:${leave.id}`;
    wantedKeys.add(key);
    const halfLabel = leave.is_half_day
      ? ` (${leave.half_day_period || "morning"} half)`
      : "";
    const leaveEnd = leave.leave_end_date || leave.leave_date;

    // Leave = all-day event(s)
    // Google all-day events use date (not dateTime)
    const event: GCalEvent = {
      summary: `Leave — ${leave.leave_type}${halfLabel}`,
      description: `Approved ${leave.leave_type} leave`,
      start: { dateTime: `${leave.leave_date}`, timeZone: TZ } as GCalEventTime,
      end: { dateTime: `${leaveEnd}`, timeZone: TZ } as GCalEventTime,
      extendedProperties: { private: { jmt_key: key } },
    };
    // For all-day events, Google API wants `date` not `dateTime`.
    // We'll handle this by using a special format in syncOneEvent.
    // Actually, let's set it correctly here:
    const allDayEvent = {
      summary: event.summary,
      description: event.description,
      start: { date: leave.leave_date },
      end: { date: addOneDay(leaveEnd) }, // Google all-day end is exclusive
      extendedProperties: event.extendedProperties,
    };
    await syncOneEvent(accessToken, calId, conn.id, key, allDayEvent as unknown as GCalEvent, eventMap, result);
  }

  // ── 4. Delete events no longer wanted ──

  for (const [key, mapRow] of Array.from(eventMap.entries())) {
    if (wantedKeys.has(key)) continue;
    if (mapRow.deleted) continue;
    if (!mapRow.google_event_id) continue;
    try {
      await deleteEvent(accessToken, calId, mapRow.google_event_id);
      await upsertEventMap(conn.id, key, mapRow.google_event_id, true);
      result.deleted++;
    } catch (err) {
      // 404/410 = already deleted on Google — just mark our side
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.includes("410")) {
        await upsertEventMap(conn.id, key, mapRow.google_event_id, true);
        result.deleted++;
      } else {
        result.errors.push(`Delete ${key}: ${msg}`);
      }
    }
  }

  await markSynced(conn.id);
  return result;
}

/** Add one day to a YYYY-MM-DD string (for Google all-day event exclusive end). */
function addOneDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Create or update a single event, driven by the event map. */
async function syncOneEvent(
  accessToken: string,
  calId: string,
  connectionId: string,
  key: string,
  event: GCalEvent,
  eventMap: Map<string, EventMapRow>,
  result: SyncResult
): Promise<void> {
  const existing = eventMap.get(key);

  try {
    if (!existing || !existing.google_event_id || existing.deleted) {
      // Create new
      const gid = await insertEvent(accessToken, calId, event);
      await upsertEventMap(connectionId, key, gid);
      result.created++;
    } else {
      // Update existing
      await updateEvent(accessToken, calId, existing.google_event_id, event);
      await upsertEventMap(connectionId, key, existing.google_event_id);
      result.updated++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If 404/410, the event was deleted on Google — recreate
    if (existing?.google_event_id && (msg.includes("404") || msg.includes("410"))) {
      try {
        const gid = await insertEvent(accessToken, calId, event);
        await upsertEventMap(connectionId, key, gid);
        result.created++;
        return;
      } catch (retryErr) {
        result.errors.push(`Retry create ${key}: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
        return;
      }
    }
    result.errors.push(`Sync ${key}: ${msg}`);
  }
}
