// Handoff-marker check — `node --import ./scripts/ts-resolve.mjs scripts/handoff-markers-check.mjs`
//
// The silent-lead nudge in src/app/api/cron/lead-followup/route.ts arms on the
// newest bot reply in a thread and, an hour later, sends "just checking that
// answered what you needed? 🙂". That is the right thing to send after an
// ANSWER and the wrong thing to send after a HANDOFF — if JAI has just told the
// lead that Coach Jeremy is taking over, the lead is waiting for Jeremy, and a
// cheerful automated nudge on top of it reads as nobody being in charge.
//
// Before 12 Sep 2026 the exclusion list held only the JOIN handoff, so a
// complaint, a PT enquiry, an anti-loop trip, a blocked fact and the paused
// adult-trial reply were all nudged. This check asserts every customer-facing
// handoff line this codebase can send is covered by HANDOFF_MARKERS — so adding
// a new handoff text without adding it to the list fails here rather than in
// someone's WhatsApp.

import {
  HANDOFF_MARKERS,
  JOIN_HANDOFF_TEXT,
  JOIN_HANDOFF_SUFFIX,
  ANTI_LOOP_HANDOFF_TEXT,
  PAUSED_ADULT_TRIAL_TEXT,
  FACT_GUARD_BLOCK_TEXT,
} from "../src/lib/wa/join-intent.ts";

let failed = 0;
const covered = (body) => HANDOFF_MARKERS.some((m) => body.includes(m));
const check = (name, body, want) => {
  const got = covered(body);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok   " : "FAIL "} ${name} -> ${got ? "excluded" : "armed"} (want ${want ? "excluded" : "armed"})`);
};

// ── every handoff line must be EXCLUDED from the nudge ────────────────────
check("join handoff", `Great news! ${JOIN_HANDOFF_TEXT}`, true);
check("join handoff suffix", `Here are the rates.\n\n${JOIN_HANDOFF_SUFFIX}`, true);
check("anti-loop handoff", ANTI_LOOP_HANDOFF_TEXT, true);
check("fact-guard block", FACT_GUARD_BLOCK_TEXT, true);
check("paused adult trial", PAUSED_ADULT_TRIAL_TEXT, true);

// The paused-adult-trial text is matched on its opening clause so that editing
// the drop-in wording later cannot silently re-arm the nudge. Prove that holds.
check(
  "paused adult trial with the tail reworded",
  PAUSED_ADULT_TRIAL_TEXT.slice(0, 90) + " Totally different ending now, book whenever.",
  true
);

// ── and an ordinary ANSWER must still be ARMED ────────────────────────────
// The nudge has to keep working; a marker list that excludes everything is the
// other way to break this.
check(
  "plain schedule answer",
  "On Tuesday we run All-Levels at 12:15–1:15pm and 6:30–7:30pm 🥊 Which one suits you?",
  false
);
check(
  "plain price answer",
  "*Adults Unlimited*\n1mo $280\n\nYou can come try a class first, no membership needed — want me to send you the booking link? 🥊",
  false
);
check("empty body", "", false);

console.log(`\n${HANDOFF_MARKERS.length} markers`);
console.log(`${failed === 0 ? "ALL CASES PASSED" : `${failed} CASE(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
