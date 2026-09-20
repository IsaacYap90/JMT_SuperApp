import {
  allowedLeadTargets,
  decideLeadTransition,
  leadTransitionIdempotencyKey,
} from "../src/lib/leads/lifecycle.ts";

const checks = [
  ["new can be contacted", decideLeadTransition("new", "contacted").kind, "apply"],
  ["direct booking can skip contacted", decideLeadTransition("new", "scheduled").kind, "apply"],
  ["same status is idempotent noop", decideLeadTransition("scheduled", "scheduled").kind, "noop"],
  ["won is terminal", decideLeadTransition("won", "lost").kind, "reject"],
  ["lost lead can reopen", decideLeadTransition("lost", "contacted").kind, "apply"],
  ["scheduled cannot return to contacted automatically", decideLeadTransition("scheduled", "contacted").kind, "reject"],
  ["scheduled can advance to showed", decideLeadTransition("scheduled", "showed").kind, "apply"],
  ["showed can advance to won manually", decideLeadTransition("showed", "won").kind, "apply"],
  ["new cannot jump to won", decideLeadTransition("new", "won").kind, "reject"],
  ["scheduled is retained", allowedLeadTargets("contacted").includes("scheduled"), true],
];

const event = {
  leadId: "lead-1",
  to: "scheduled",
  trigger: "trial_scheduled",
  sourceRecordId: "trial:abc/123",
};
const key1 = leadTransitionIdempotencyKey(event);
const key2 = leadTransitionIdempotencyKey({ ...event });
const key3 = leadTransitionIdempotencyKey({ ...event, sourceRecordId: "trial:def" });
checks.push(["same source has stable idempotency key", key1, key2]);
checks.push(["different source has different key", key1 !== key3, true]);

let failed = 0;
for (const [name, got, expected] of checks) {
  const pass = got === expected;
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}`);
  if (!pass) console.log(`     got ${String(got)}, want ${String(expected)}`);
}

console.log(`\n${failed ? `${failed} CASE(S) FAILED` : "ALL LIFECYCLE CASES PASSED"}`);
process.exit(failed ? 1 : 0);
