// Fallback fact-sheet check — `node --import ./scripts/ts-resolve.mjs scripts/facts-fallback-check.mjs`
//
// JAI reads its fact sheet from the `jai_facts` DB row; the in-code JAI_FACTS
// constant is ONLY the fallback, used when the env is unset, the query errors,
// or the read times out (see readJaiFacts in src/lib/wa/jai-facts.ts).
//
// That makes the constant easy to forget, and on 12 Sep 2026 it had rotted into
// something actively harmful: the live row correctly forbade naming a return
// month for adult trials, while the constant still INSTRUCTED JAI to say they
// return "around September" — the exact line Isaac logged as a bug on 1 Sep,
// when it was still going out to customers ON 1 September. The constant also
// still carried the old "15-min buffer … you're good to join" wording next to
// the new hard-cutoff section, contradicting itself in the same sheet.
//
// So a Supabase blip did not degrade JAI to a safe older answer — it regressed
// it to a wrong one, silently. This check asserts the fallback cannot carry a
// retired rule again. It does NOT touch the network: it is a property test on
// the constant, so it runs in CI and in /predeploy like everything else.

import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";
import { PAUSED_ADULT_TRIAL_TEXT } from "../src/lib/wa/join-intent.ts";

let failed = 0;
const fail = (msg) => { failed++; console.log(`FAIL  ${msg}`); };
const ok = (msg) => console.log(`ok    ${msg}`);

// ── retired rules that must never reappear in the fallback ─────────────────
// Each entry: [label, regex, why it was retired].
const BANNED = [
  // 🛑 Ban the INSTRUCTION, not the topic. Both sheets discuss "around September"
  // — the good one only to forbid it ("Saying \"around September\" was still going
  // out to customers ON 1 September"). Banning the bare phrase flagged the
  // prohibition as the violation. These two patterns appear ONLY in the form that
  // tells JAI to say it, and are absent from the live row; verified both ways.
  [
    "an instruction to name a return month for adult trials",
    /looking to bring them back|Always say it that way/i,
    "Coach Jeremy never fixed a date; saying it reads as a lie or a bot that cannot tell the date (Isaac, 2026-09-01).",
  ],
  [
    'the old "15-minute buffer" wording',
    /15[-\s]?min(?:ute)?\s+buffer/i,
    "Replaced by a HARD 15-minute cutoff. The buffer wording told people 15 minutes late that they were still good to join.",
  ],
  [
    'telling a late arrival they are "good to join"',
    /within\s+15\s*mins?\s+of\s+the\s+start,\s*you'?re\s+good\s+to\s+join/i,
    "Same retired rule as above, in the worked example.",
  ],
  // NOTE: there is deliberately no "waitlist" pattern here. Both sheets mention a
  // waitlist only to forbid inventing one, so any pattern loose enough to catch a
  // promise also catches the prohibition. Checked 12 Sep 2026.
];
for (const [label, re, why] of BANNED) {
  const m = JAI_FACTS.match(re);
  if (m) fail(`fallback sheet still contains ${label}: "${m[0]}" — ${why}`);
  else ok(`fallback sheet is free of ${label}`);
}

// ── rules the fallback MUST carry ─────────────────────────────────────────
// If the fallback is missing these, a DB blip drops a hard rule entirely.
const REQUIRED = [
  ["the hard 15-minute cutoff", /hard\s+15[-\s]?minute\s+cut[-\s]?off/i],
  ["the no-phone-calls rule", /JAI NEVER CALLS|cannot call or accept call/i],
  ["the adult-trial pause", /NEVER OFFER AN ADULT A TRIAL/i],
  ["the never-name-a-month rule", /NEVER name a month, a date or a season/i],
  ["the promo hard rule", /NEVER state, estimate, confirm, deny, correct or speculate/i],
  ["the join answer's three mandatory items", /A PLAIN "HOW DO I JOIN" IS ANSWERED/i],
  ["the kids/pre-teen class size", /10 people per class|capped at 10 pax/i],
  ["the 10-class pack expiry", /expires?\s+3\s+months/i],
  ["the pack-is-not-shareable rule", /CANNOT BE SHARED|NOT shareable/i],
];
for (const [label, re] of REQUIRED) {
  if (re.test(JAI_FACTS)) ok(`fallback sheet carries ${label}`);
  else fail(`fallback sheet is MISSING ${label}`);
}

// ── internal consistency: the schedule must name no 7pm class ─────────────
// The sheet's own loudest rule. A contradicting line here would be read as fact.
// Two lines legitimately contain "7pm" and are present in the live row too: the
// prohibition itself, and the worked example quoting the 2026-07-20 mistake back.
// Strip both before testing — otherwise this check reports the warning as the bug,
// which it did on its first run.
const SEVEN_PM_ALLOWED = [
  /There is no 7pm class[^\n]*/gi,
  /"All-Levels classes at 7pm and 7:30pm"[^\n]*/gi,
];
let sevenPmCorpus = JAI_FACTS;
for (const re of SEVEN_PM_ALLOWED) sevenPmCorpus = sevenPmCorpus.replace(re, "");
const stray = sevenPmCorpus.match(/.{0,80}\b7\s*pm\b.{0,80}/i);
if (stray) fail(`fallback sheet mentions a 7pm class outside the prohibition: "${stray[0].trim()}"`);
else ok("fallback sheet names no 7pm class outside the prohibition");

// ── CANNED customer-facing copy ───────────────────────────────────────────
// These strings are assigned straight to outText and sent verbatim — no model,
// no fact guard, nothing between them and the customer. So the fact sheet's
// rules do not reach them, and a retired rule can sit here indefinitely.
// PAUSED_ADULT_TRIAL_TEXT did exactly that: on 12 Sep 2026 it was still telling
// every adult who asked about a free trial, on BOTH WhatsApp and Instagram,
// that trials return "around September" — the line Isaac had already recorded
// as a bug on 1 September, while the fact sheet two files away forbade naming a
// month at all. A canned string needs its own check precisely because no guard
// will ever look at it.
const CANNED = [["PAUSED_ADULT_TRIAL_TEXT", PAUSED_ADULT_TRIAL_TEXT]];
const MONTHS =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
for (const [name, text] of CANNED) {
  const m = text.match(MONTHS);
  if (m) fail(`${name} names a month ("${m[0]}") — the sheet forbids naming a month, date or season for the adult-trial return`);
  else ok(`${name} names no month`);
  if (/waitlist|notify you|let you know when/i.test(text)) {
    fail(`${name} promises a notification — there is no waitlist and no follow-up sequence`);
  } else {
    ok(`${name} promises no notification`);
  }
}

console.log(`\n${failed === 0 ? "ALL CASES PASSED" : `${failed} CASE(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
