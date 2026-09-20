import assert from "node:assert/strict";
import { buildCustomerLinkPlan, chronologicalTimeline, conversationContactKeys, resolveExactCustomer } from "../src/lib/customers/customer-resolver.ts";

const anchor = { source: "public.leads", sourceKey: "l1", phone: "9123 4567", email: "Lead@Example.com" };
const phoneMatch = { source: "jai.leads", sourceKey: "6591234567", phone: "+65 9123 4567" };
const emailMatch = { source: "public.trial_bookings", sourceKey: "t1", email: "lead@example.com" };
const phoneResolution = resolveExactCustomer(anchor, [anchor, phoneMatch, emailMatch]);
assert.equal(phoneResolution.status, "resolved");
assert.equal(phoneResolution.status === "resolved" && phoneResolution.matchedBy, "phone");
assert.deepEqual(phoneResolution.status === "resolved" && phoneResolution.records.map((r) => r.source), ["public.leads", "jai.leads"]);
assert.equal(buildCustomerLinkPlan(phoneResolution)?.sourceLinks.length, 2);

const emailAnchor = { source: "public.leads", sourceKey: "l2", phone: null, email: " Lead@Example.com " };
const emailResolution = resolveExactCustomer(emailAnchor, [emailAnchor, emailMatch]);
assert.equal(emailResolution.status, "resolved");
assert.equal(emailResolution.status === "resolved" && emailResolution.matchedBy, "email");

const emailFallbackAnchor = { source: "public.leads", sourceKey: "l4", phone: "81112222", email: "lead@example.com" };
const emailFallback = resolveExactCustomer(emailFallbackAnchor, [emailFallbackAnchor, emailMatch]);
assert.equal(emailFallback.status, "resolved");
assert.equal(emailFallback.status === "resolved" && emailFallback.matchedBy, "email");

const duplicate = { source: "public.leads", sourceKey: "l3", phone: "+6591234567" };
const ambiguous = resolveExactCustomer(anchor, [anchor, duplicate, phoneMatch]);
assert.equal(ambiguous.status, "ambiguous");
assert.equal(buildCustomerLinkPlan(ambiguous), null);

const unmatchedJai = { source: "jai.leads", sourceKey: "raw:+65 9000 0000", phone: null, email: null };
const unmatchedJaiResolution = resolveExactCustomer(unmatchedJai, [unmatchedJai]);
assert.equal(unmatchedJaiResolution.status, "unmatched");
assert.deepEqual(conversationContactKeys(unmatchedJai, unmatchedJaiResolution.records), ["raw:+65 9000 0000"]);
assert.deepEqual(
  conversationContactKeys(unmatchedJai, [unmatchedJai, unmatchedJai, { ...unmatchedJai, sourceKey: "second-raw-key" }], 1),
  ["raw:+65 9000 0000"]
);

const timeline = chronologicalTimeline([
  { id: "3", at: "2026-09-03T00:00:00Z", source: "jai.conversations", title: "reply" },
  { id: "1", at: "2026-09-01T00:00:00Z", source: "public.leads", title: "lead" },
  { id: "2", at: "2026-09-02T00:00:00Z", source: "public.trial_bookings", title: "trial" },
]);
assert.deepEqual(timeline.map((event) => event.source), ["public.leads", "public.trial_bookings", "jai.conversations"]);

console.log("customer-resolver-check: all assertions passed");
