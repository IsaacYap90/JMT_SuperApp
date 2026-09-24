import assert from "node:assert/strict";
import { phonePtTime, phonePtChanged } from "../src/lib/gcal/phone-policy.ts";

const baseline = { scheduled_at: "2090-09-29T02:00:00Z", duration_minutes: 60, coach_id: "coach", member_id: "client", status: "scheduled", edited_at: null };
const event = { id: "event", start: { dateTime: "2090-09-29T10:00:00+08:00" }, end: { dateTime: "2090-09-29T11:00:00+08:00" } };
assert.deepEqual(phonePtTime(event), { scheduled_at: "2090-09-29T02:00:00.000Z", duration_minutes: 60 });
assert.equal(phonePtChanged(event, baseline), false);
assert.equal(phonePtChanged({ ...event, summary: "Changed coach name" }, baseline), false);
assert.equal(phonePtChanged({ ...event, end: { dateTime: "2090-09-29T12:00:00+08:00" } }, baseline), true);
assert.equal(phonePtChanged({ id: "event", status: "cancelled" }, baseline), true);
assert.equal(phonePtTime({ ...event, recurrence: ["RRULE:FREQ=WEEKLY"] }), null);
assert.equal(phonePtTime({ ...event, recurringEventId: "series" }), null);
assert.equal(phonePtTime({ id: "event", start: { date: "2090-09-29" }, end: { date: "2090-09-30" } }), null);
assert.equal(phonePtTime({ ...event, start: { dateTime: "2090-09-29T10:00:00" } }), null);
assert.equal(phonePtTime({ ...event, end: { dateTime: "2090-09-29T09:00:00+08:00" } }), null);
assert.equal(phonePtTime({ ...event, end: { dateTime: "2090-09-29T10:01:01+08:00" } }), null);
assert.equal(phonePtTime({ ...event, end: { dateTime: "2090-09-30T10:00:00+08:00" } }), null);
console.log("gcal-phone-check: 12 assertions passed");
