// pause-stale check — plain `node scripts/pause-stale-check.mjs`.
//
// There is no unit-test runner here (npm test = Playwright e2e), so this is the
// proof that pauseIsStale does what its doc comment claims. It drives the REAL
// function with a stubbed jai client, and every case asserts on the returned
// boolean — a version of this logic that stopped working fails this script.
//
// The case this file was written for (12 Sep 2026): `if (!last) return true`
// meant a thread where no human had EVER replied was "stale" immediately, so a
// promo/price-leak pause cleared on the customer's very next message. Most
// threads have no human row at all, so the 24h rule never applied to the
// threads the pause was written for.

import { pauseIsStale, PAUSE_STALE_MS } from "../src/lib/wa/pause-stale.ts";
import { FOLLOWUP_VIA } from "../src/lib/wa/followup-dropin.ts";

const NOW = Date.parse("2026-09-12T12:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const H = 60 * 60 * 1000;

// Minimal stand-in for the PostgREST builder chain pauseIsStale uses. `rows` is
// the whole assistant-row set for the thread; the stub applies the same filters
// the real query does, so the test exercises the filter logic too.
function stubClient(rows, { error = null } = {}) {
  return {
    from() {
      const q = {
        _humanOnly: false,
        select() { return q; },
        eq() { return q; },
        or(expr) { if (String(expr).includes("via.not.in")) q._humanOnly = true; return q; },
        order() { return q; },
        limit(n) {
          if (error) return Promise.resolve({ data: null, error });
          const isHuman = (r) => r.via === null || (r.via !== "bot" && r.via !== FOLLOWUP_VIA);
          const out = rows
            .filter((r) => (q._humanOnly ? isHuman(r) : true))
            .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
            .slice(0, n);
          return Promise.resolve({ data: out, error: null });
        },
      };
      return q;
    },
  };
}

let failed = 0;
const check = async (name, rows, want, opts) => {
  const got = await pauseIsStale(stubClient(rows, opts), "6512345678", NOW);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok   " : "FAIL "} ${name} -> ${got} (want ${want})`);
};

const BOT = (t) => ({ created_at: ago(t), via: "bot" });
const HUMAN = (t) => ({ created_at: ago(t), via: "human" });
const NUDGE = (t) => ({ created_at: ago(t), via: FOLLOWUP_VIA });

// ── Jeremy is on it → stay paused ─────────────────────────────────────────
await check("human replied 1h ago", [HUMAN(1 * H), BOT(2 * H)], false);
await check("human replied 23h ago", [HUMAN(23 * H)], false);
// ── Jeremy is not on it → hand back ───────────────────────────────────────
await check("human replied 25h ago", [HUMAN(25 * H)], true);

// ── the hole: no human row at all ─────────────────────────────────────────
// The pause exists because JAI escalated. The escalating reply is a BOT row, so
// its age is how long Jeremy has had the chat. Inside 24h it is still his.
await check("no human ever, bot escalated 30min ago", [BOT(0.5 * H)], false);
await check("no human ever, bot escalated 2h ago", [BOT(2 * H)], false);
await check("no human ever, bot escalated 23h ago", [BOT(23 * H)], false);
await check("no human ever, bot escalated 25h ago", [BOT(25 * H)], true);
// An automated nudge is not Jeremy, but it IS a clock — and it must not be
// read as a human reply either.
await check("no human ever, only a followup nudge 25h ago", [NUDGE(25 * H)], true);
await check("no human ever, only a followup nudge 2h ago", [NUDGE(2 * H)], false);

// ── fail-closed ───────────────────────────────────────────────────────────
await check("read error stays paused", [HUMAN(99 * H)], false, { error: { message: "boom" } });
await check("no rows at all stays paused", [], false);

const futureExpiry = new Date(NOW + H).toISOString();
const explicitExpiryGot = await pauseIsStale(
  stubClient([BOT(25 * H)]),
  "6512345678",
  NOW,
  futureExpiry
);
const explicitExpiryOk = explicitExpiryGot === false;
if (!explicitExpiryOk) failed++;
console.log(`${explicitExpiryOk ? "ok   " : "FAIL "} explicit future expiry blocks a stale legacy clock -> ${explicitExpiryGot} (want false)`);

const invalidExpiryGot = await pauseIsStale(
  stubClient([BOT(25 * H)]),
  "6512345678",
  NOW,
  "not-a-date"
);
const invalidExpiryOk = invalidExpiryGot === false;
if (!invalidExpiryOk) failed++;
console.log(`${invalidExpiryOk ? "ok   " : "FAIL "} invalid explicit expiry fails closed -> ${invalidExpiryGot} (want false)`);

console.log(`\nPAUSE_STALE_MS = ${PAUSE_STALE_MS}`);
console.log(`${failed === 0 ? "ALL CASES PASSED" : `${failed} CASE(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
