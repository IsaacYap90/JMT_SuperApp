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
assert.ok(typeof sync.syncCoach === "function", "syncCoach should be exported");
const syncSource = await readFile(new URL("../src/lib/gcal/sync.ts", import.meta.url), "utf8");
assert.match(syncSource, /data\?\.role === "master_admin"/, "Only master admins should mirror every coach");
assert.match(syncSource, /fetchCalendarPt\(conn\.user_id, includeAllCoaches\)/, "Calendar sync should include PT sessions in both scopes");
assert.match(syncSource, /PT — \$\{coachName\} · \$\{clientName\}/, "Master-admin PT events should identify the coach");
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
