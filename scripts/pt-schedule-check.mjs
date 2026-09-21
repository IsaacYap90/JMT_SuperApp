import assert from "node:assert/strict";
import {
  assertValidPtDuration,
  isValidPtScheduledAt,
  parsePtScheduledAt,
} from "../src/lib/pt-schedule.ts";

assert.equal(isValidPtScheduledAt("2026-09-21T10:00:00+08:00"), true);
assert.equal(isValidPtScheduledAt("32026-01-31T13:30:00+00:00"), false);
assert.equal(isValidPtScheduledAt("not-a-date"), false);
assert.equal(parsePtScheduledAt("2026-09-21T10:00:00+08:00").toISOString(), "2026-09-21T02:00:00.000Z");
assert.throws(() => parsePtScheduledAt("42026-01-08T12:30:00+00:00"));
assert.doesNotThrow(() => assertValidPtDuration(60));
assert.throws(() => assertValidPtDuration(0));
assert.throws(() => assertValidPtDuration(481));

console.log("✅ pt-schedule-check: 8 assertions passed");
