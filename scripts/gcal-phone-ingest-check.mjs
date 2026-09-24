import assert from "node:assert/strict";
import { ingestPhoneChanges } from "../src/lib/gcal/phone-changes.ts";

// Every network request is intercepted. These credentials deliberately cannot
// address any real service, and this process never reads project env files.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://calendar-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-test-key";
process.env.NEXT_PUBLIC_APP_URL = "https://jmt-test.invalid";
const conn = { id: "connection", user_id: "coach", google_calendar_id: "owned-calendar" };
const baseline = { scheduled_at: "2090-09-29T02:00:00Z", duration_minutes: 60, coach_id: "coach", member_id: "client", status: "scheduled", edited_at: null };
const canonical = { local_entity_key: "pt:real-session", google_event_id: "canonical", deleted: false, pt_baseline: baseline };
const moved = { id: "canonical", start: { dateTime: "2090-09-29T12:00:00+08:00" }, end: { dateTime: "2090-09-29T13:00:00+08:00" } };
let requests = [];
let drafts = [];
let result = "applied";
let actor = { role: "coach", is_active: true };
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? input.toString());
  const method = init?.method || "GET";
  const body = init?.body ? JSON.parse(init.body) : null;
  requests.push({ url, method, body });
  const json = value => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url.hostname === "calendar-test.invalid") {
    if (url.pathname.endsWith("/users")) return json(actor);
    if (url.pathname.endsWith("/rpc/apply_gcal_pt_change")) return json(result);
    if (url.pathname.endsWith("/gcal_pt_drafts")) {
      if (method === "GET") return json(drafts);
      if (method === "POST") return json({ id: "draft-id" });
      if (method === "PATCH") return new Response(null, { status: 204 });
    }
  }
  if (url.hostname === "www.googleapis.com" && url.pathname === "/calendar/v3/calendars/owned-calendar/events/new-event" && method === "PATCH") return json({});
  throw new Error(`Unexpected network request: ${method} ${url}`);
};
const rpcRequests = () => requests.filter(r => r.url.pathname.includes("/rpc/"));
const run = async (events, map = new Map([[canonical.local_entity_key, canonical]])) => {
  requests = [];
  const errors = [];
  await ingestPhoneChanges(conn, "fake-token", "owned-calendar", events, map, errors);
  return errors;
};

await run([moved]);
assert.equal(rpcRequests().length, 1);
assert.equal(rpcRequests()[0].body.p_google_event_id, "canonical");
assert.equal(rpcRequests()[0].body.p_scheduled_at, "2090-09-29T04:00:00.000Z");
await run([]);
assert.equal(rpcRequests().length, 0, "Missing list entry never cancels PT");
await run([{ id: "canonical", status: "cancelled" }]);
assert.equal(rpcRequests()[0].body.p_cancel, true);
await run([{ ...moved, id: "forged", extendedProperties: { private: { jmt_key: "pt:real-session" } } }]);
assert.equal(rpcRequests().length, 0, "Copied marker cannot target business records");
await run([moved], new Map([["class:fixed", { ...canonical, local_entity_key: "class:fixed" }]]));
assert.equal(rpcRequests().length, 0, "Classes have no phone writeback");
actor = { role: "coach", is_active: false };
await run([moved]);
assert.equal(rpcRequests().length, 0);
actor = { role: "coach", is_active: true };
result = "conflict";
assert.match((await run([moved]))[0], /rejected \(conflict\)/);
result = "applied";

await run([{ ...moved, id: "new-event", summary: "New client" }]);
const created = requests.find(r => r.method === "POST" && r.url.pathname.endsWith("gcal_pt_drafts"));
assert.equal(created.body.connection_id, "connection");
assert.equal(created.body.summary, "New client");
assert.equal(rpcRequests().length, 0, "Draft is never an actual PT");
assert.match(requests.find(r => r.url.hostname === "www.googleapis.com").body.description, /calendar\/manage\?draft=draft-id/);
drafts = [{ id: "draft-id", google_event_id: "new-event", status: "completed" }];
await run([{ ...moved, id: "new-event" }]);
assert.equal(requests.filter(r => r.method !== "GET").length, 0, "Completed draft never reopens");
drafts = [{ id: "draft-id", google_event_id: "new-event", status: "pending" }];
await run([{ id: "new-event", status: "cancelled" }]);
assert.equal(requests.find(r => r.method === "PATCH").body.status, "dismissed");
console.log("gcal-phone-ingest-check: 13 assertions passed (all network mocked)");
