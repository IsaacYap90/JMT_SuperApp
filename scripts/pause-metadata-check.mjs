import {
  PAUSE_OBSERVABILITY_MS,
  buildPauseMetadata,
  clearPauseMetadata,
  isMissingPauseMetadataColumn,
  refreshedPauseExpiry,
} from "../src/lib/wa/pause-metadata.ts";

const NOW = Date.parse("2026-09-20T04:00:00.000Z");
const pause = buildPauseMetadata({
  pausedBy: " jai ",
  source: "join_intent",
  reason: "Customer wants to join",
  now: NOW,
});
const clear = clearPauseMetadata();

const checks = [
  ["pause sets flag", pause.ai_paused, true],
  ["pause stamps exact start", pause.ai_paused_at, "2026-09-20T04:00:00.000Z"],
  ["pause trims actor", pause.ai_paused_by, "jai"],
  ["pause expires at 24h", Date.parse(pause.ai_pause_expires_at) - NOW, PAUSE_OBSERVABILITY_MS],
  ["human reply refreshes expiry", Date.parse(refreshedPauseExpiry(NOW)) - NOW, PAUSE_OBSERVABILITY_MS],
  ["clear disables pause", clear.ai_paused, false],
  ["clear removes reason", clear.ai_pause_reason, null],
  ["Postgres missing-column code recognised", isMissingPauseMetadataColumn({ code: "42703" }), true],
  ["PostgREST missing-column message recognised", isMissingPauseMetadataColumn({ message: "column leads.ai_paused_at does not exist" }), true],
  ["network errors are not treated as old schema", isMissingPauseMetadataColumn({ message: "fetch failed" }), false],
];

let threw = false;
try {
  buildPauseMetadata({ pausedBy: "", source: "join_intent", reason: "reason", now: NOW });
} catch {
  threw = true;
}
checks.push(["blank actor is rejected", threw, true]);

let failed = 0;
for (const [name, got, expected] of checks) {
  const pass = got === expected;
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}`);
  if (!pass) console.log(`     got ${String(got)}, want ${String(expected)}`);
}
console.log(`\n${failed ? `${failed} CASE(S) FAILED` : "ALL PAUSE METADATA CASES PASSED"}`);
process.exit(failed ? 1 : 0);

