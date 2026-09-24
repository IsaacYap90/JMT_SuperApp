/**
 * Google Calendar sync engine.
 *
 * Reads assigned classes, PT sessions, and approved leaves for a coach,
 * then creates/updates/deletes events on the coach's JMT Schedule
 * secondary calendar. Idempotent via gcal_event_map.
 *
 * PT edits in the app-owned calendar are reconciled before the outbound mirror.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { SG_HOLIDAYS } from "@/lib/sg-holidays";
import {
  insertEvent,
  updateEvent,
  deleteEvent,
  createSecondaryCalendar,
  listCalendarEvents,
  type GCalEvent,
  type GCalEventTime,
  type GCalListedEvent,
} from "./google-calendar";
import {
  getValidAccessToken,
  setCalendarId,
  markSynced,
  type GCalConnection,
} from "./connection";
import { isValidPtScheduledAt } from "@/lib/pt-schedule";
import { randomUUID } from "crypto";
import { ingestPhoneChanges } from "./phone-changes";
import { ptBaseline, type PtBaseline } from "./phone-policy";
import { leaveOverlapsInterval } from "@/lib/leave-overlap";

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

function classIsBlockedByLeave(
  cls: ClassRow,
  date: string,
  assignedCoachIdsByClass: Map<string, Set<string>>,
  leaves: LeaveRow[]
): boolean {
  const assignedCoachIds = new Set<string>([
    ...(cls.lead_coach_id ? [cls.lead_coach_id] : []),
    ...(cls.assistant_coach_id ? [cls.assistant_coach_id] : []),
    ...Array.from(assignedCoachIdsByClass.get(cls.id) || []),
  ]);
  return leaves.some(
    (leave) => assignedCoachIds.has(leave.coach_id) && leaveOverlapsInterval(leave,
      Date.parse(`${sgtDatetime(date, cls.start_time)}+08:00`),
      Date.parse(`${sgtDatetime(date, cls.end_time)}+08:00`))
  );
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
  edited_at: string | null;
  member?: { full_name: string } | null;
  coach?: { full_name: string } | null;
}

interface LeaveRow {
  id: string;
  coach_id: string;
  leave_date: string;
  leave_end_date: string | null;
  leave_type: string;
  is_half_day: boolean;
  half_day_period?: "morning" | "evening" | null;
  status: string;
}

interface CalendarClasses {
  classes: ClassRow[];
  assignedCoachIdsByClass: Map<string, Set<string>>;
}

/** Master admins mirror the operational calendar; coaches mirror only their work. */
async function isMasterAdmin(userId: string): Promise<boolean> {
  const sb = createAdminClient();
  const { data, error } = await sb.from("users").select("role").eq("id", userId).maybeSingle();
  if (error) throw new Error(`Failed to check Google Calendar sync role: ${error.message}`);
  return data?.role === "master_admin";
}

async function fetchCalendarClasses(userId: string, includeAllCoaches: boolean): Promise<CalendarClasses> {
  const sb = createAdminClient();
  const { data: allClasses, error: classesError } = await sb
    .from("classes")
    .select("id, name, day_of_week, event_date, start_time, end_time, is_active, lead_coach_id, assistant_coach_id, created_at")
    .eq("is_active", true);
  if (classesError) throw new Error(`Failed to read classes for Google Calendar sync: ${classesError.message}`);

  const { data: ccLinks, error: linksError } = await sb
    .from("class_coaches")
    .select("class_id, coach_id");
  if (linksError) throw new Error(`Failed to read class coaches for Google Calendar sync: ${linksError.message}`);

  const assignedCoachIdsByClass = new Map<string, Set<string>>();
  for (const link of ccLinks || []) {
    const typedLink = link as { class_id: string; coach_id: string };
    const ids = assignedCoachIdsByClass.get(typedLink.class_id) || new Set<string>();
    ids.add(typedLink.coach_id);
    assignedCoachIdsByClass.set(typedLink.class_id, ids);
  }

  const classes = includeAllCoaches
    ? (allClasses || [])
    : (allClasses || []).filter(
        (c: ClassRow) =>
          c.lead_coach_id === userId ||
          c.assistant_coach_id === userId ||
          assignedCoachIdsByClass.get(c.id)?.has(userId)
      );

  return { classes: classes as ClassRow[], assignedCoachIdsByClass };
}

async function fetchCalendarPt(userId: string, includeAllCoaches: boolean): Promise<PtRow[]> {
  const sb = createAdminClient();
  // Only future + recent past (2 weeks back) to keep the sync window manageable
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  let query = sb
    .from("pt_sessions")
    .select("id, coach_id, member_id, scheduled_at, duration_minutes, status, created_at, edited_at, member:users!pt_sessions_member_id_fkey(full_name), coach:users!pt_sessions_coach_id_fkey(full_name)")
    .in("status", ["scheduled", "confirmed", "completed"])
    .gte("scheduled_at", twoWeeksAgo);
  if (!includeAllCoaches) query = query.eq("coach_id", userId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to read PT sessions for Google Calendar sync: ${error.message}`);
  // Supabase can return an FK join as an array; normalize to a single object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[]).map((row) => ({
    ...row,
    member: Array.isArray(row.member) ? row.member[0] || null : row.member,
    coach: Array.isArray(row.coach) ? row.coach[0] || null : row.coach,
  })) as PtRow[];
}

async function fetchCalendarLeaves(userId: string, includeAllCoaches: boolean): Promise<LeaveRow[]> {
  const sb = createAdminClient();
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  let query = sb
    .from("leaves")
    .select("id, coach_id, leave_date, leave_end_date, leave_type, is_half_day, half_day_period, status")
    .eq("status", "approved")
    .is("deleted_at", null)
    .or(`leave_end_date.gte.${todayStr},and(leave_end_date.is.null,leave_date.gte.${todayStr})`);
  if (!includeAllCoaches) query = query.eq("coach_id", userId);
  const { data, error } = await query;
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
  pt_baseline: PtBaseline | null;
}

async function getEventMap(connectionId: string): Promise<Map<string, EventMapRow>> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("gcal_event_map")
    .select("id, local_entity_key, google_event_id, synced_at, deleted, pt_baseline")
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
  deleted: boolean = false,
  baseline: PtBaseline | null = null
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
      pt_baseline: baseline,
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

/**
 * Google Calendar accepts modest parallelism, but a full account can have
 * hundreds of events. A bounded worker pool keeps manual syncs comfortably
 * within the server request window without flooding Google's API.
 */
// Google rate-limits event writes per calendar. A single writer makes a first
// sync slower, but prevents partial calendars. Normal syncs are near-zero
// writes because they compare the one listed remote snapshot before updating.
const SYNC_CONCURRENCY = 1;

interface EventWork {
  key: string;
  event: GCalEvent;
  baseline?: PtBaseline;
}

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

/** Run independent Google-event operations with bounded concurrency. */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workerCount = Math.min(Math.max(1, limit), queue.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item !== undefined) await worker(item);
      }
    })
  );
}

/** True when an approved leave should remove this PT from the calendar mirror. */
export function isPtBlockedByLeave(
  scheduledAt: string,
  coachId: string,
  leaves: LeaveRow[],
  durationMinutes = 60
): boolean {
  const start = Date.parse(scheduledAt);
  return leaves.some(
    (leave) => leave.coach_id === coachId && leaveOverlapsInterval(leave, start, start + durationMinutes * 60_000)
  );
}

/**
 * Full sync for one coach. Idempotent: safe to retry on failure.
 */
export async function syncCoach(conn: GCalConnection): Promise<SyncResult> {
  const sb = createAdminClient();
  const lock = randomUUID();
  const now = new Date();
  // Manual and scheduled runs must not import the same edit concurrently or
  // let an older remote snapshot undo the other run's outbound writes.
  const { data, error } = await sb.from("gcal_connections").update({ sync_lock_id: lock, sync_lock_until: new Date(now.getTime() + 120_000).toISOString() })
    .eq("id", conn.id).is("revoked_at", null)
    .or(`sync_lock_until.is.null,sync_lock_until.lt.${now.toISOString()}`).select("id").maybeSingle();
  if (error) throw new Error(`Calendar sync lock: ${error.message}`);
  if (!data) return { created: 0, updated: 0, deleted: 0, errors: ["Calendar sync is already running. Try again shortly."] };
  try { return await syncCoachLocked(conn); }
  finally {
    const { error: releaseError } = await sb.from("gcal_connections").update({ sync_lock_id: null, sync_lock_until: null }).eq("id", conn.id).eq("sync_lock_id", lock);
    if (releaseError) console.error("Calendar lock release failed", releaseError.message);
  }
}

async function syncCoachLocked(conn: GCalConnection): Promise<SyncResult> {
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
  let remoteEvents: GCalListedEvent[] = [];
  const remoteSnapshotAvailable = true;
  try {
    remoteEvents = await listCalendarEvents(accessToken, calId);
  } catch (err) {
    // A remote snapshot lets us avoid rewrites. If it is unavailable, keep
    // syncing safely; map-backed writes still repair missing events.
    result.errors.push(`List calendar events: ${err instanceof Error ? err.message : String(err)}`);
    // A failed list cannot distinguish a phone edit from the existing mirror.
    // Stop instead of overwriting potentially unseen changes.
    return result;
  }
  await ingestPhoneChanges(conn, accessToken, calId, remoteEvents, eventMap, result.errors);
  const remoteEventsById = new Map(remoteEvents.map((event) => [event.id, event]));
  const wantedKeys = new Set<string>();
  const classWork: EventWork[] = [];
  const ptWork: EventWork[] = [];
  const leaveWork: EventWork[] = [];

  // ── 1. Classes: expand recurring classes into individual weekly events ──

  const includeAllCoaches = await isMasterAdmin(conn.user_id);
  const { classes, assignedCoachIdsByClass } = await fetchCalendarClasses(conn.user_id, includeAllCoaches);
  const leaves = await fetchCalendarLeaves(conn.user_id, includeAllCoaches);

  for (const cls of classes) {
    if (cls.event_date) {
      if (classIsBlockedByLeave(cls, cls.event_date, assignedCoachIdsByClass, leaves)) continue;
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
      classWork.push({ key, event });
    } else if (cls.day_of_week) {
      // Recurring: expand into individual events for the next N weeks
      const dates = upcomingDates(cls.day_of_week, CLASS_HORIZON_WEEKS);

      for (const date of dates) {
        // Skip holidays
        if (holidaySet.has(date)) continue;

        // Master-admin calendars respect every assigned coach's leave; coach
        // calendars only fetch their own leave.
        if (classIsBlockedByLeave(cls, date, assignedCoachIdsByClass, leaves)) continue;

        const key = `class:${cls.id}:${date}`;
        wantedKeys.add(key);
        const event: GCalEvent = {
          summary: cls.name,
          description: `Class\nTiming is fixed. Manage coach assignments: ${(process.env.NEXT_PUBLIC_APP_URL || "https://jmtos.ionicx.ai").replace(/\/$/, "")}/calendar/manage?class=${cls.id}`,
          start: sgtTime({ dateTime: sgtDatetime(date, cls.start_time), timeZone: TZ }),
          end: sgtTime({ dateTime: sgtDatetime(date, cls.end_time), timeZone: TZ }),
          extendedProperties: { private: { jmt_key: key } },
        };
        classWork.push({ key, event });
      }
    }
  }

  // ── 2. PT sessions ──

  const ptSessions = await fetchCalendarPt(conn.user_id, includeAllCoaches);
  for (const pt of ptSessions) {
    // A malformed legacy PT must never stop every coach's calendar sync.
    if (!isValidPtScheduledAt(pt.scheduled_at)) {
      result.errors.push(`Skipped PT ${pt.id}: invalid scheduled time`);
      continue;
    }
    const start = utcToSgt(pt.scheduled_at);
    // Do not mark a leave-conflicting PT as wanted: the delete phase below
    // then removes an already-mirrored event without changing the JMT record.
    if (isPtBlockedByLeave(pt.scheduled_at, pt.coach_id, leaves, pt.duration_minutes || 60)) continue;
    const key = `pt:${pt.id}`;
    wantedKeys.add(key);
    const endUtc = new Date(new Date(pt.scheduled_at).getTime() + (pt.duration_minutes || 60) * 60_000);
    const end = utcToSgt(endUtc.toISOString());
    const clientName = pt.member?.full_name || "Client";
    const coachName = pt.coach?.full_name || "Coach";

    const event: GCalEvent = {
      summary: includeAllCoaches ? `PT — ${coachName} · ${clientName}` : `PT — ${clientName}`,
      description: includeAllCoaches
        ? `PT Session · ${pt.duration_minutes || 60}min · Coach: ${coachName}\nManage PT: ${(process.env.NEXT_PUBLIC_APP_URL || "https://jmtos.ionicx.ai").replace(/\/$/, "")}/calendar/manage?pt=${pt.id}`
        : `PT Session · ${pt.duration_minutes || 60}min\nManage PT: ${(process.env.NEXT_PUBLIC_APP_URL || "https://jmtos.ionicx.ai").replace(/\/$/, "")}/calendar/manage?pt=${pt.id}`,
      start: sgtTime({ dateTime: sgtDatetime(start.date, start.time), timeZone: TZ }),
      end: sgtTime({ dateTime: sgtDatetime(end.date, end.time), timeZone: TZ }),
      extendedProperties: { private: { jmt_key: key } },
    };
    ptWork.push({ key, event, baseline: ptBaseline(pt) });
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
    leaveWork.push({ key, event: allDayEvent as unknown as GCalEvent });
  }

  // PT must not wait behind hundreds of recurring class writes. Each key is
  // unique; the remote snapshot skips unchanged entries before a write occurs.
  const eventWork = [...ptWork, ...leaveWork, ...classWork];
  await runWithConcurrency(eventWork, SYNC_CONCURRENCY, ({ key, event, baseline }) =>
    syncOneEvent(accessToken, calId, conn.id, key, event, eventMap, remoteSnapshotAvailable ? remoteEventsById : null, result, baseline)
  );

  // A prior network interruption can happen after Google creates an event but
  // before its map row is saved. Retrying then leaves an untracked duplicate.
  // Reconcile only marked JMT events, preserving the map's canonical event.
  if (remoteSnapshotAvailable) {
    await removeDuplicateJmtEvents(accessToken, calId, conn.id, wantedKeys, remoteEvents, result);
  }

  // ── 4. Delete events no longer wanted ──

  const deleteWork: EventMapRow[] = [];
  for (const [key, mapRow] of Array.from(eventMap.entries())) {
    if (wantedKeys.has(key)) continue;
    // Preserve completed PT and class history outside the active sync window.
    if (isHistoricalCalendarEvent(key, mapRow.pt_baseline, remoteEventsById.get(mapRow.google_event_id || ""))) continue;
    if (mapRow.deleted) continue;
    if (!mapRow.google_event_id) continue;
    deleteWork.push(mapRow);
  }

  await runWithConcurrency(deleteWork, SYNC_CONCURRENCY, async (mapRow) => {
    const key = mapRow.local_entity_key;
    const googleEventId = mapRow.google_event_id;
    if (!googleEventId) return;
    try {
      // Persist intent before deleting. If Google succeeds and our map write
      // fails, its tombstone must never be mistaken for a coach cancellation.
      if (mapRow.pt_baseline) {
        const { error } = await createAdminClient().from("gcal_event_map").update({ pt_baseline: null }).eq("id", mapRow.id);
        if (error) throw new Error(error.message);
      }
      await deleteEvent(accessToken, calId, googleEventId, remoteEventsById.get(googleEventId)?.etag);
      await upsertEventMap(conn.id, key, googleEventId, true);
      result.deleted++;
    } catch (err) {
      // 404/410 = already deleted on Google — just mark our side
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.includes("410")) {
        await upsertEventMap(conn.id, key, googleEventId, true);
        result.deleted++;
      } else {
        result.errors.push(`Delete ${key}: ${msg}`);
      }
    }
  });

  await markSynced(conn.id);
  return result;
}

async function removeDuplicateJmtEvents(
  accessToken: string,
  calendarId: string,
  connectionId: string,
  wantedKeys: Set<string>,
  remoteEvents: GCalListedEvent[],
  result: SyncResult
): Promise<void> {
  // Read again after writes so a freshly-created map row is canonical too.
  const freshMap = await getEventMap(connectionId);
  const duplicateIds = remoteEvents.flatMap((event) => {
    const key = event.extendedProperties?.private?.jmt_key;
    if (!key || !wantedKeys.has(key) || event.status === "cancelled") return [];
    const canonicalId = freshMap.get(key)?.google_event_id;
    return canonicalId && event.id !== canonicalId ? [event.id] : [];
  });

  await runWithConcurrency(duplicateIds, SYNC_CONCURRENCY, async (eventId) => {
    try {
      await deleteEvent(accessToken, calendarId, eventId);
      result.deleted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("404") && !msg.includes("410")) {
        result.errors.push(`Delete duplicate Google event ${eventId}: ${msg}`);
      }
    }
  });
}

/** Add one day to a YYYY-MM-DD string (for Google all-day event exclusive end). */
function addOneDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Completed work stays on the calendar even after its source leaves the sync window. */
export function isHistoricalCalendarEvent(
  key: string, baseline: PtBaseline | null, remote: GCalListedEvent | undefined,
  now = Date.now()
): boolean {
  if (!key.startsWith("class:") && !key.startsWith("pt:")) return false;
  // The last mirrored PT time is authoritative; a phone edit must not turn a
  // future cancellation into protected history by moving the event backwards.
  if (key.startsWith("pt:") && baseline) {
    const end = Date.parse(baseline.scheduled_at) + baseline.duration_minutes * 60_000;
    if (Number.isFinite(end)) return end <= now;
  }
  const remoteEnd = timeValue(remote?.end);
  if (remoteEnd?.startsWith("time:")) return Number(remoteEnd.slice(5)) <= now;
  // Expanded classes encode their occurrence date, including when Google
  // returns a tombstone without start/end. One-off classes use remote end.
  const match = /^class:[^:]+:(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (!match) return false;
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: TZ });
  return match[1] < today;
}

/** Create or update a single event, driven by the event map. */
function timeValue(value: { date?: string; dateTime?: string } | undefined): string | undefined {
  if (value?.date) return `date:${value.date}`;
  if (!value?.dateTime) return undefined;
  // JMT sends SGT wall-clock datetimes plus a timeZone field; Google returns
  // the same instant with an explicit +08:00 offset. Compare instants, not
  // their string serialisation, so unchanged events stay zero-write.
  const iso = /(?:Z|[+-]\d{2}:\d{2})$/.test(value.dateTime)
    ? value.dateTime
    : `${value.dateTime}+08:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `time:${ms}` : `raw:${value.dateTime}`;
}

function remoteMatchesEvent(remote: GCalListedEvent, event: GCalEvent): boolean {
  const expectedStart = timeValue(event.start as unknown as { date?: string; dateTime?: string });
  const expectedEnd = timeValue(event.end as unknown as { date?: string; dateTime?: string });
  return remote.summary === event.summary
    && (remote.description || "") === (event.description || "")
    && timeValue(remote.start) === expectedStart
    && timeValue(remote.end) === expectedEnd;
}

async function syncOneEvent(
  accessToken: string,
  calId: string,
  connectionId: string,
  key: string,
  event: GCalEvent,
  eventMap: Map<string, EventMapRow>,
  remoteEventsById: Map<string, GCalListedEvent> | null,
  result: SyncResult,
  baseline?: PtBaseline
): Promise<void> {
  const existing = eventMap.get(key);
  const remote = existing?.google_event_id && remoteEventsById
    ? remoteEventsById.get(existing.google_event_id)
    : undefined;

  try {
    if (!existing || !existing.google_event_id || existing.deleted) {
      // Create new
      const gid = await insertEvent(accessToken, calId, event);
      await upsertEventMap(connectionId, key, gid, false, baseline);
      result.created++;
    } else if (remoteEventsById && (!remote || remote.status === "cancelled")) {
      // The event was removed from Google outside JMT; recreate it directly.
      const gid = await insertEvent(accessToken, calId, event);
      await upsertEventMap(connectionId, key, gid, false, baseline);
      result.created++;
    } else if (!remote || !remoteMatchesEvent(remote, event)) {
      // Update existing
      await updateEvent(accessToken, calId, existing.google_event_id, event, remote?.etag);
      await upsertEventMap(connectionId, key, existing.google_event_id, false, baseline);
      result.updated++;
    } else if (baseline && (!existing.pt_baseline || Object.entries(baseline).some(([field, value]) => existing.pt_baseline?.[field as keyof PtBaseline] !== value))) {
      await upsertEventMap(connectionId, key, existing.google_event_id, false, baseline);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If 404/410, the event was deleted on Google — recreate
    if (existing?.google_event_id && (msg.includes("404") || msg.includes("410"))) {
      try {
        const gid = await insertEvent(accessToken, calId, event);
        await upsertEventMap(connectionId, key, gid, false, baseline);
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
