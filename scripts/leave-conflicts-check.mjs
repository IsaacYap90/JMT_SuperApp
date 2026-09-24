import assert from "node:assert/strict";
import { assertCoachAvailableForPt, assertCoachesAvailableForClass } from "../src/lib/leave-conflicts.ts";

function admin(leaves) {
  const chain = {
    select: () => chain,
    in: () => chain,
    eq: () => chain,
    is: () => chain,
    lte: async () => ({ data: leaves, error: null }),
  };
  return { from: () => chain };
}

const coach = "coach-1";
const fullDay = { coach_id: coach, leave_date: "2026-09-29", leave_end_date: "2026-10-02", is_half_day: false, half_day_period: null };
const morning = { coach_id: coach, leave_date: "2026-10-03", leave_end_date: null, is_half_day: true, half_day_period: "morning" };
const evening = { coach_id: coach, leave_date: "2026-10-04", leave_end_date: null, is_half_day: true, half_day_period: "evening" };

await assert.rejects(() => assertCoachAvailableForPt(admin([fullDay]), coach, new Date("2026-10-01T10:00:00+08:00"), 60));
await assert.rejects(() => assertCoachAvailableForPt(admin([morning]), coach, new Date("2026-10-03T18:00:00+08:00"), 60));
await assert.doesNotReject(() => assertCoachAvailableForPt(admin([morning]), coach, new Date("2026-10-03T18:30:00+08:00"), 60));
await assert.rejects(() => assertCoachAvailableForPt(admin([evening]), coach, new Date("2026-10-04T18:00:00+08:00"), 60));
await assert.doesNotReject(() => assertCoachAvailableForPt(admin([evening]), coach, new Date("2026-10-04T17:30:00+08:00"), 60));
await assert.rejects(() => assertCoachesAvailableForClass(admin([fullDay]), [coach], { day_of_week: "thursday", event_date: null, start_time: "12:15", end_time: "13:15" }));
await assert.doesNotReject(() => assertCoachesAvailableForClass(admin([morning]), [coach], { day_of_week: "friday", event_date: null, start_time: "18:30", end_time: "19:30" }));

console.log("✅ leave-conflicts-check: 7 assertions passed");
