/**
 * Test: gcal sync engine helpers and event building logic.
 * Run: node --import ./scripts/ts-resolve.mjs scripts/gcal-sync-check.mjs
 *
 * Tests the pure functions without hitting Google or Supabase.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// These tests focus on the parts we can test without network:
// 1. The google-calendar module exports the right functions
// 2. The connection module exports the right interfaces
// 3. The sync module exports syncCoach
// 4. The crypto module round-trips

let passed = 0;

// --- Verify module exports ---

const gcal = await import("../src/lib/gcal/google-calendar.ts");
assert.ok(typeof gcal.buildAuthUrl === "function", "buildAuthUrl should be exported");
assert.ok(typeof gcal.exchangeCode === "function", "exchangeCode should be exported");
assert.ok(typeof gcal.refreshAccessToken === "function", "refreshAccessToken should be exported");
assert.ok(typeof gcal.emailFromIdToken === "function", "emailFromIdToken should be exported");
assert.ok(typeof gcal.createSecondaryCalendar === "function", "createSecondaryCalendar should be exported");
assert.equal(typeof gcal.findCalendarBySummary, "undefined", "findCalendarBySummary should NOT be exported (removed: calendar.app.created scope)");
assert.ok(typeof gcal.insertEvent === "function", "insertEvent should be exported");
assert.ok(typeof gcal.updateEvent === "function", "updateEvent should be exported");
assert.ok(typeof gcal.deleteEvent === "function", "deleteEvent should be exported");
assert.ok(typeof gcal.listCalendarEvents === "function", "Calendar sync should list app-owned events to remove retry duplicates");
assert.ok(Array.isArray(gcal.GOOGLE_SCOPES), "GOOGLE_SCOPES should be an array");
assert.ok(gcal.GOOGLE_SCOPES.includes("https://www.googleapis.com/auth/calendar.app.created"), "Should include calendar.app.created scope");
assert.ok(!gcal.GOOGLE_SCOPES.includes("https://www.googleapis.com/auth/calendar"), "Must NOT include broad calendar scope");
passed++;

const conn = await import("../src/lib/gcal/connection.ts");
assert.ok(typeof conn.getConnection === "function", "getConnection should be exported");
assert.ok(typeof conn.getAllActiveConnections === "function", "getAllActiveConnections should be exported");
assert.ok(typeof conn.createConnection === "function", "createConnection should be exported");
assert.ok(typeof conn.setCalendarId === "function", "setCalendarId should be exported");
assert.ok(typeof conn.getValidAccessToken === "function", "getValidAccessToken should be exported");
assert.ok(typeof conn.revokeConnection === "function", "revokeConnection should be exported");
assert.ok(typeof conn.markSynced === "function", "markSynced should be exported");
passed++;

const sync = await import("../src/lib/gcal/sync.ts");
const { leaveOverlapsInterval } = await import("../src/lib/leave-overlap.ts");
const eveningLeave = { leave_date: "2026-09-29", leave_end_date: null, is_half_day: true, half_day_period: "evening" };
const at = (value) => Date.parse(value + "+08:00");
assert.equal(leaveOverlapsInterval(eveningLeave, at("2026-09-29T18:00:00"), at("2026-09-29T19:00:00")), true);
assert.equal(leaveOverlapsInterval(eveningLeave, at("2026-09-29T17:30:00"), at("2026-09-29T18:30:00")), false);
assert.equal(leaveOverlapsInterval({ ...eveningLeave, half_day_period: "morning" }, at("2026-09-29T18:30:00"), at("2026-09-29T19:30:00")), false);
assert.equal(leaveOverlapsInterval({ ...eveningLeave, is_half_day: false }, at("2026-09-28T23:30:00"), at("2026-09-29T00:30:00")), true);
assert.equal(leaveOverlapsInterval({ ...eveningLeave, deleted_at: "2026-09-28" }, at("2026-09-29T18:00:00"), at("2026-09-29T19:00:00")), false);
assert.equal(sync.isPtBlockedByLeave("2026-09-29T10:00:00Z", "coach", [{ ...eveningLeave, coach_id: "coach" }], 60), true);
passed++;
// Expiring the active sync window must never erase completed work.
const historyNow = Date.parse("2026-09-24T06:00:00Z");
const oldPt = { scheduled_at: "2026-09-01T03:00:00Z", duration_minutes: 60 };
const futurePt = { ...oldPt, scheduled_at: "2026-09-25T03:00:00Z" };
const pastEvent = { id: "old", end: { dateTime: "2026-09-01T12:00:00+08:00" } };
const futureEvent = { id: "future", end: { dateTime: "2026-09-25T12:00:00+08:00" } };
assert.equal(sync.isHistoricalCalendarEvent("pt:old", oldPt, undefined, historyNow), true, "PT older than the two-week query window survives even without remote times");
assert.equal(sync.isHistoricalCalendarEvent("pt:legacy", null, pastEvent, historyNow), true, "Legacy PT without baseline retains history using Google end");
assert.equal(sync.isHistoricalCalendarEvent("class:one-off", null, pastEvent, historyNow), true, "Past one-off classes retain history");
assert.equal(sync.isHistoricalCalendarEvent("class:weekly:2026-09-22", null, undefined, historyNow), true, "Past recurring occurrence retains history without remote times");
assert.equal(sync.isHistoricalCalendarEvent("class:today:2026-09-24", null, { id: "ended", end: { dateTime: "2026-09-24T13:15:00+08:00" } }, historyNow), true, "An already-ended class today is history");
assert.equal(sync.isHistoricalCalendarEvent("pt:future", futurePt, pastEvent, historyNow), false, "Phone edits cannot hide future PT cancellation or leave cleanup");
assert.equal(sync.isHistoricalCalendarEvent("class:future:2026-09-25", null, futureEvent, historyNow), false, "Future class cleanup remains enabled");
assert.equal(sync.isHistoricalCalendarEvent("pt:ongoing", { ...oldPt, scheduled_at: "2026-09-24T05:30:00Z" }, undefined, historyNow), false, "An ongoing PT is not completed history");
assert.equal(sync.isHistoricalCalendarEvent("pt:unknown", null, undefined, historyNow), false, "Unknown times cannot imply historical work");
passed++;
assert.ok(typeof sync.syncCoach === "function", "syncCoach should be exported");
assert.ok(typeof sync.isPtBlockedByLeave === "function", "PT leave filter should be testable");
assert.ok(typeof sync.runWithConcurrency === "function", "Sync should use a bounded-concurrency worker pool");
const syncSource = await readFile(new URL("../src/lib/gcal/sync.ts", import.meta.url), "utf8");
assert.match(syncSource, /data\?\.role === "master_admin"/, "Only master admins should mirror every coach");
assert.match(syncSource, /fetchCalendarPt\(conn\.user_id, includeAllCoaches\)/, "Calendar sync should include PT sessions in both scopes");
assert.match(syncSource, /PT — \$\{coachName\} · \$\{clientName\}/, "Master-admin PT events should identify the coach");
assert.match(syncSource, /removeDuplicateJmtEvents/, "Sync should reconcile marked retry duplicates");
assert.match(syncSource, /extendedProperties\?\.private\?\.jmt_key/, "Duplicate cleanup must only touch JMT-marked events");
assert.match(syncSource, /const eventWork = \[\.\.\.ptWork, \.\.\.leaveWork, \.\.\.classWork\]/, "PT events must be written before classes");
assert.match(syncSource, /remoteMatchesEvent/, "Unchanged remote events must be detected before a Google write");
assert.match(syncSource, /remoteSnapshotAvailable/, "A failed Google event listing must not create duplicate events");
assert.equal(
  sync.isPtBlockedByLeave("2026-09-21T04:00:00.000Z", "coach-1", [{ coach_id: "coach-1", leave_date: "2026-09-21", leave_end_date: null, is_half_day: false }]),
  true,
  "A full-day leave should remove a PT event from Google Calendar"
);
assert.equal(
  sync.isPtBlockedByLeave("2026-09-21T11:00:00.000Z", "coach-1", [{ coach_id: "coach-1", leave_date: "2026-09-21", leave_end_date: null, is_half_day: true, half_day_period: "morning" }]),
  false,
  "A morning half-day leave should keep a 7pm PT event"
);
const ptLoop = syncSource.slice(syncSource.indexOf("const ptSessions = await fetchCalendarPt"));
assert.ok(
  ptLoop.indexOf("if (isPtBlockedByLeave") < ptLoop.indexOf("wantedKeys.add(key)"),
  "A blocked PT must not be marked wanted, so its old Google event is deleted"
);
passed++;

// A large account must not serially wait for every Google request. Confirm all
// work completes while the pool never exceeds its configured safety bound.
let inFlight = 0;
let peakInFlight = 0;
const completed = [];
await sync.runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
  inFlight++;
  peakInFlight = Math.max(peakInFlight, inFlight);
  await new Promise((resolve) => setTimeout(resolve, 5));
  completed.push(item);
  inFlight--;
});
assert.equal(completed.length, 7, "Every queued calendar operation should complete");
assert.ok(peakInFlight > 1, "Calendar operations should run in parallel");
assert.ok(peakInFlight <= 3, "Calendar operations must respect the concurrency limit");
passed++;

// --- Test emailFromIdToken ---

// Valid JWT with email in payload
const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
const payload = Buffer.from(JSON.stringify({ email: "coach@gmail.com", sub: "12345" })).toString("base64url");
const fakeJwt = `${header}.${payload}.fakesig`;
assert.equal(gcal.emailFromIdToken(fakeJwt), "coach@gmail.com", "Should extract email from JWT");
passed++;

// JWT without email
const payloadNoEmail = Buffer.from(JSON.stringify({ sub: "12345" })).toString("base64url");
assert.equal(gcal.emailFromIdToken(`${header}.${payloadNoEmail}.sig`), null, "Should return null when no email");
passed++;

// Invalid JWT
assert.equal(gcal.emailFromIdToken("not-a-jwt"), null, "Should return null for invalid JWT");
passed++;

// --- Test buildAuthUrl ---

// Must not throw even without env vars set (we skip actual redirect)
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/gcal/callback";

const authUrl = gcal.buildAuthUrl("test-state-123");
assert.ok(authUrl.includes("accounts.google.com"), "Auth URL should point to Google");
assert.ok(authUrl.includes("test-client-id"), "Auth URL should contain client ID");
assert.ok(authUrl.includes("test-state-123"), "Auth URL should contain state");
assert.ok(authUrl.includes("access_type=offline"), "Auth URL should request offline access");
assert.ok(authUrl.includes("prompt=consent"), "Auth URL should force consent for refresh token");
passed++;

console.log(`\u2705 gcal-sync-check: ${passed} assertions passed`);
