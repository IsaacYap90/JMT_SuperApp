/**
 * Test: Google Calendar OAuth configuration gate.
 * Run: node --import ./scripts/ts-resolve.mjs scripts/gcal-config-check.mjs
 *
 * Covers the failure that produced Safari's download prompt on a local
 * preview: /api/gcal/connect threw because GOOGLE_* env vars were absent, and
 * Next returned a raw 500 body. The route must now fail CLOSED with a redirect.
 *
 * Touches no network, no database, no .env file.
 */

import assert from "node:assert/strict";

const REQUIRED = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GCAL_TOKEN_ENCRYPTION_KEY",
];

// Start from a clean slate so the "missing" cases are real.
const saved = {};
for (const k of REQUIRED) {
  saved[k] = process.env[k];
  delete process.env[k];
}

function clearEnv() {
  for (const k of REQUIRED) delete process.env[k];
}

const VALID_KEY = "a".repeat(64);
function setValidEnv(overrides = {}) {
  clearEnv();
  process.env.GOOGLE_CLIENT_ID = "1234-abc.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "GOCSPX-test-secret-value";
  process.env.GOOGLE_REDIRECT_URI = "https://jmtos.ionicx.ai/api/gcal/callback";
  process.env.GCAL_TOKEN_ENCRYPTION_KEY = VALID_KEY;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const cfg = await import("../src/lib/gcal/config.ts");
const gcal = await import("../src/lib/gcal/google-calendar.ts");

let passed = 0;

// --- 1. Nothing configured (the local-preview case) ---

clearEnv();
let s = cfg.getGcalConfigStatus();
assert.equal(s.configured, false, "No env vars set must report configured=false");
assert.deepEqual(s.missing.slice().sort(), REQUIRED.slice().sort(), "All four vars must be listed as missing");
assert.deepEqual(s.invalid, [], "Absent vars are missing, not invalid");
assert.equal(cfg.isGcalConfigured(), false, "isGcalConfigured must be false when unset");
passed++;

// --- 2. Fully configured ---

setValidEnv();
s = cfg.getGcalConfigStatus();
assert.equal(s.configured, true, `Valid env must report configured=true (missing=${s.missing}, invalid=${s.invalid})`);
assert.deepEqual(s.missing, [], "Nothing should be missing");
assert.deepEqual(s.invalid, [], "Nothing should be invalid");
passed++;

// --- 3. Each single var missing flips it closed ---

for (const k of REQUIRED) {
  setValidEnv({ [k]: undefined });
  s = cfg.getGcalConfigStatus();
  assert.equal(s.configured, false, `Missing ${k} must report configured=false`);
  assert.ok(s.missing.includes(k), `${k} must be named in missing`);
}
passed++;

// --- 4. Blank / whitespace-only counts as missing, not configured ---

for (const blank of ["", "   ", "\t\n"]) {
  setValidEnv({ GOOGLE_CLIENT_ID: blank });
  s = cfg.getGcalConfigStatus();
  assert.equal(s.configured, false, `Blank GOOGLE_CLIENT_ID (${JSON.stringify(blank)}) must not count as configured`);
  assert.ok(s.missing.includes("GOOGLE_CLIENT_ID"), "Blank var must be reported missing");
}
passed++;

// --- 5. Malformed encryption key is invalid, not missing ---
// crypto.ts throws unless this is exactly 64 hex chars, so a short or non-hex
// key would blow up at token-write time instead of at the gate.

for (const bad of ["tooshort", "z".repeat(64), "a".repeat(63), "a".repeat(65)]) {
  setValidEnv({ GCAL_TOKEN_ENCRYPTION_KEY: bad });
  s = cfg.getGcalConfigStatus();
  assert.equal(s.configured, false, `Malformed key (${bad.slice(0, 12)}...) must report configured=false`);
  assert.ok(s.invalid.includes("GCAL_TOKEN_ENCRYPTION_KEY"), "Malformed key must be named in invalid");
  assert.ok(!s.missing.includes("GCAL_TOKEN_ENCRYPTION_KEY"), "A present-but-bad key is invalid, not missing");
}
// Uppercase hex is still valid hex.
setValidEnv({ GCAL_TOKEN_ENCRYPTION_KEY: "A1B2C3D4".repeat(8) });
assert.equal(cfg.getGcalConfigStatus().configured, true, "Uppercase hex key must be accepted");
passed++;

// --- 6. Redirect URI scheme rules (the Tailscale-preview trap) ---
// Google accepts https, plus http ONLY on loopback. A plain-http Tailscale or
// LAN host can never be a registered OAuth callback.

const usable = [
  "https://jmtos.ionicx.ai/api/gcal/callback",
  "http://localhost:3000/api/gcal/callback",
  "http://127.0.0.1:3000/api/gcal/callback",
];
const unusable = [
  "http://jmt-box.tail1234.ts.net:3000/api/gcal/callback", // Tailscale over http
  "http://192.168.1.50:3000/api/gcal/callback",            // LAN over http
  "http://jmtos.ionicx.ai/api/gcal/callback",              // public host over http
  "ftp://jmtos.ionicx.ai/api/gcal/callback",
  "not-a-url",
  "/api/gcal/callback",                                     // relative
];

for (const uri of usable) {
  assert.equal(cfg.isUsableRedirectUri(uri), true, `${uri} must be accepted`);
  setValidEnv({ GOOGLE_REDIRECT_URI: uri });
  assert.equal(cfg.getGcalConfigStatus().configured, true, `${uri} must leave the feature configured`);
}
for (const uri of unusable) {
  assert.equal(cfg.isUsableRedirectUri(uri), false, `${uri} must be rejected`);
  setValidEnv({ GOOGLE_REDIRECT_URI: uri });
  s = cfg.getGcalConfigStatus();
  assert.equal(s.configured, false, `${uri} must report configured=false`);
  assert.ok(s.invalid.includes("GOOGLE_REDIRECT_URI"), `${uri} must be named in invalid`);
}
passed++;

// --- 7. The status object leaks no secret VALUES, only names ---

setValidEnv();
const serialized = JSON.stringify(cfg.getGcalConfigStatus());
for (const k of REQUIRED) {
  assert.ok(
    !serialized.includes(process.env[k]),
    `getGcalConfigStatus() must never echo the value of ${k} (it is sent to the browser)`
  );
}
clearEnv();
const serializedMissing = JSON.stringify(cfg.getGcalConfigStatus());
assert.ok(serializedMissing.includes("GOOGLE_CLIENT_ID"), "Names are fine to report");
passed++;

// --- 7b. The thing that used to produce the 500 still throws ---
// buildAuthUrl() reads GOOGLE_CLIENT_ID/REDIRECT_URI and throws when unset.
// That throw is the raw 500 body Safari offered to download. We are NOT making
// it safe — we are making sure the route never reaches it. Asserting it still
// throws keeps the next test honest: if this ever stopped throwing, test 8
// would pass for the wrong reason.

clearEnv();
assert.throws(
  () => gcal.buildAuthUrl("state"),
  /GOOGLE_CLIENT_ID not set/,
  "buildAuthUrl must still throw when unconfigured — that is what the gate exists to avoid"
);
passed++;

// --- 8. /api/gcal/connect fails CLOSED when unconfigured ---
// This is the regression: previously it threw (500 + raw body -> Safari
// download prompt). It must now answer a normal redirect back to /profile.

clearEnv();
const connect = await import("../src/app/api/gcal/connect/route.ts");
const { NextRequest } = await import("next/server");

const req = new NextRequest("http://jmt-box.tail1234.ts.net:3000/api/gcal/connect");
let res;
try {
  res = await connect.GET(req);
} catch (err) {
  assert.fail(`/api/gcal/connect must not throw when unconfigured, but threw: ${err && err.message}`);
}

assert.ok(res, "connect route must return a Response");
assert.ok([302, 303, 307, 308].includes(res.status), `Expected a redirect status, got ${res.status}`);

const location = res.headers.get("location");
assert.ok(location, "Redirect must carry a Location header");
const loc = new URL(location);
assert.equal(loc.pathname, "/profile", `Must redirect to /profile, got ${loc.pathname}`);
assert.equal(
  loc.searchParams.get("gcal_error"),
  "not_configured",
  "Must explain the reason as not_configured"
);
assert.ok(!loc.host.includes("accounts.google.com"), "Must NOT send the browser to Google when unconfigured");

// Nothing download-looking: no attachment disposition, no JSON error body.
assert.equal(res.headers.get("content-disposition"), null, "Redirect must not set Content-Disposition");

// No OAuth state cookie should be minted when we never started the flow.
const setCookie = res.headers.get("set-cookie") || "";
assert.ok(!setCookie.includes("gcal_oauth_state="), "Must not set an OAuth state cookie when unconfigured");

// Getting a Response at all proves the gate ran FIRST: this script has no Next
// request scope, so createClient() -> cookies() would throw if the handler had
// reached it. (Verified against a copy of the pre-fix handler, which threw.)
passed++;

// --- 9. When configured, the real Google navigation is preserved ---

setValidEnv();
const authUrl = gcal.buildAuthUrl("nonce:user:sig");
const parsed = new URL(authUrl);
assert.equal(parsed.origin, "https://accounts.google.com", "Auth URL must point at Google");
assert.equal(parsed.pathname, "/o/oauth2/v2/auth", "Auth URL path must be Google's consent endpoint");
assert.equal(parsed.searchParams.get("client_id"), process.env.GOOGLE_CLIENT_ID, "client_id must be passed through");
assert.equal(parsed.searchParams.get("redirect_uri"), process.env.GOOGLE_REDIRECT_URI, "redirect_uri must be passed through");
assert.equal(parsed.searchParams.get("response_type"), "code", "response_type must stay 'code'");
assert.equal(parsed.searchParams.get("state"), "nonce:user:sig", "state must be passed through");
assert.ok(!parsed.searchParams.has("client_secret"), "The consent URL must never carry the client secret");
passed++;

// --- 10. Scope stays app-created-only ---
// calendar.app.created limits the app to calendars/events IT created. Widening
// this would give JMT OS access to a coach's personal calendar.

const scopeParam = (parsed.searchParams.get("scope") || "").split(" ");
assert.ok(
  scopeParam.includes("https://www.googleapis.com/auth/calendar.app.created"),
  "Consent URL must request calendar.app.created"
);
const FORBIDDEN_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendars",
  "https://www.googleapis.com/auth/calendar.calendarlist",
];
for (const bad of FORBIDDEN_SCOPES) {
  assert.ok(!gcal.GOOGLE_SCOPES.includes(bad), `GOOGLE_SCOPES must not include the broader scope ${bad}`);
  assert.ok(!scopeParam.includes(bad), `Consent URL must not request the broader scope ${bad}`);
}
assert.deepEqual(
  gcal.GOOGLE_SCOPES.slice().sort(),
  ["email", "https://www.googleapis.com/auth/calendar.app.created", "openid"],
  "GOOGLE_SCOPES must stay exactly: calendar.app.created + openid + email"
);
passed++;

// Restore whatever the environment had.
clearEnv();
for (const k of REQUIRED) if (saved[k] !== undefined) process.env[k] = saved[k];

console.log(`gcal-config-check: ${passed} groups passed`);
