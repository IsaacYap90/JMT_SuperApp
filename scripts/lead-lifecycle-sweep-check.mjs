import assert from "node:assert/strict";
import {
  LEAD_QUIET_PERIOD_MS,
  decideSilenceTimeout,
  hasAmbiguousLeadIdentity,
  hasExactBookedTrial,
} from "../src/lib/leads/lifecycle-sweep.ts";
import { executeLeadTransition } from "../src/lib/leads/lifecycle-service.ts";

const origin = Date.parse("2026-09-18T00:00:00.000Z");
const base = {
  status: "new",
  createdAt: new Date(origin).toISOString(),
  latestCustomerInboundAt: null,
  latestLifecycleAt: null,
  identityAmbiguous: false,
  hasBookedTrial: false,
};

assert.equal(LEAD_QUIET_PERIOD_MS, 48 * 60 * 60 * 1000);
assert.deepEqual(
  decideSilenceTimeout({ ...base, nowMs: origin + LEAD_QUIET_PERIOD_MS - 1000 }),
  {
    eligible: false,
    reason: "quiet_period_not_elapsed",
    eligibleAt: "2026-09-20T00:00:00.000Z",
  },
  "47:59:59 must not be eligible"
);
assert.deepEqual(
  decideSilenceTimeout({ ...base, nowMs: origin + LEAD_QUIET_PERIOD_MS }),
  {
    eligible: true,
    reason: "eligible",
    quietSince: "2026-09-18T00:00:00.000Z",
    eligibleAt: "2026-09-20T00:00:00.000Z",
  },
  "48:00:00 is the inclusive eligibility boundary"
);

assert.equal(
  decideSilenceTimeout({
    ...base,
    nowMs: origin + LEAD_QUIET_PERIOD_MS,
    hasBookedTrial: true,
  }).reason,
  "booked_trial"
);
assert.equal(
  decideSilenceTimeout({
    ...base,
    nowMs: origin + LEAD_QUIET_PERIOD_MS,
    identityAmbiguous: true,
  }).reason,
  "identity_ambiguous"
);

const duplicateLeads = [
  { id: "lead-a", phone: "9123 4567", email: "one@example.com" },
  { id: "lead-b", phone: "+65 9123 4567", email: "two@example.com" },
];
assert.equal(hasAmbiguousLeadIdentity(duplicateLeads[0], duplicateLeads), true);
assert.equal(
  hasAmbiguousLeadIdentity(
    { id: "lead-c", phone: "8111 2222", email: "shared@example.com" },
    [
      { id: "lead-c", phone: "8111 2222", email: "shared@example.com" },
      { id: "lead-d", phone: "8333 4444", email: "shared@example.com" },
    ]
  ),
  false,
  "a unique exact phone wins before email ambiguity"
);

assert.equal(
  hasExactBookedTrial(
    { phone: "9123 4567", email: "booked@example.com" },
    [
      { phone: "+65 9123 4567", status: "cancelled", calendly_details: null },
      {
        phone: "+65 8000 0000",
        status: "booked",
        calendly_details: { email: "BOOKED@example.com" },
      },
    ]
  ),
  true,
  "an exact booked email protects the lead even when a phone-matched trial is cancelled"
);

const laterActivity = new Date(origin + 60 * 60 * 1000).toISOString();
assert.equal(
  decideSilenceTimeout({
    ...base,
    latestLifecycleAt: laterActivity,
    nowMs: origin + LEAD_QUIET_PERIOD_MS,
  }).reason,
  "quiet_period_not_elapsed",
  "later lifecycle activity restarts the quiet clock"
);
assert.equal(
  decideSilenceTimeout({
    ...base,
    latestLifecycleAt: laterActivity,
    nowMs: origin + LEAD_QUIET_PERIOD_MS + 60 * 60 * 1000,
  }).eligible,
  true
);

function fakeGateway(initial) {
  let status = initial;
  const events = new Map();
  return {
    events,
    current: () => status,
    gateway: {
      async status() { return status; },
      async commit(input) {
        if (events.has(input.p_idempotency_key)) return "duplicate";
        if (status !== input.p_expected_from) return "conflict";
        status = input.p_to_status;
        events.set(input.p_idempotency_key, input);
        return "applied";
      },
    },
  };
}

const silenceInput = {
  leadId: "lead-1",
  to: "lost",
  trigger: "silence_timeout",
  source: { schema: "public", table: "leads", key: "48h:2026-09-18T00:00:00.000Z" },
  actor: { type: "system" },
  automatic: true,
};
const duplicateCron = fakeGateway("contacted");
assert.equal(await executeLeadTransition(silenceInput, duplicateCron.gateway), "applied");
assert.equal(await executeLeadTransition(silenceInput, duplicateCron.gateway), "noop");
assert.equal(duplicateCron.events.size, 1, "repeated cron runs append only one stage event");

for (const scenario of [
  { trigger: "reopened", to: "contacted", key: "late-inbound" },
  { trigger: "outbound_contact", to: "contacted", key: "successful-reply" },
  { trigger: "trial_scheduled", to: "scheduled", key: "late-booking" },
]) {
  const reopened = fakeGateway("lost");
  assert.equal(
    await executeLeadTransition({
      leadId: "lead-2",
      to: scenario.to,
      trigger: scenario.trigger,
      source: { key: scenario.key },
      actor: { type: "system" },
      automatic: true,
    }, reopened.gateway),
    "applied"
  );
  assert.equal(reopened.current(), scenario.to, `${scenario.trigger} must reopen Lost`);
}

console.log("lead-lifecycle-sweep-check: all assertions passed");
