import assert from "node:assert/strict";
import { executeLeadTransition, resolveUniquePublicLead } from "../src/lib/leads/lifecycle-service.ts";

function fakeGateway(initial = "new") {
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

const base = {
  leadId: "lead-1",
  trigger: "trial_scheduled",
  source: { schema: "public", table: "trial_bookings", key: "booking-1" },
  actor: { type: "system" },
  automatic: true,
};

const duplicate = fakeGateway();
assert.equal(await executeLeadTransition({ ...base, to: "scheduled" }, duplicate.gateway), "applied");
assert.equal(await executeLeadTransition({ ...base, to: "scheduled" }, duplicate.gateway), "noop");
assert.equal(duplicate.events.size, 1, "duplicate booking action must not append another event");

const rejected = fakeGateway();
assert.equal(await executeLeadTransition({ ...base, to: "showed", trigger: "trial_outcome" }, rejected.gateway), "rejected");
assert.equal(rejected.current(), "new");
assert.equal(rejected.events.size, 0, "rejected transition must not append an event");

const chain = fakeGateway();
assert.equal(await executeLeadTransition({ ...base, to: "contacted", trigger: "outbound_contact", source: { key: "reply-1" } }, chain.gateway), "applied");
assert.equal(await executeLeadTransition({ ...base, to: "scheduled" }, chain.gateway), "applied");
assert.equal(await executeLeadTransition({ ...base, to: "showed", trigger: "trial_outcome" }, chain.gateway), "applied");
assert.equal(chain.current(), "showed");
assert.equal(chain.events.size, 3);

const rows = [
  { id: "a", status: "new", phone: "9123 4567", email: null },
  { id: "b", status: "new", phone: "+65 9123 4567", email: null },
];
assert.deepEqual(resolveUniquePublicLead(rows, { phone: "6591234567" }), { kind: "ambiguous" });
assert.equal(rejected.current(), "new", "ambiguous identity leaves lead state unchanged");

const lost = fakeGateway();
assert.equal(await executeLeadTransition({ ...base, to: "lost" }, lost.gateway), "rejected");
assert.equal(await executeLeadTransition({ ...base, to: "lost", trigger: "manual", automatic: false }, lost.gateway), "applied");

console.log("lead-lifecycle-automation-check: all assertions passed");
