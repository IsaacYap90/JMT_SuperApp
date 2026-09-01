// Fact-guard check script — plain `node scripts/validate-facts-check.mjs`.
// (Node >= 22.18 strips the TypeScript types on import; this repo runs Node 24.)
//
// There is no unit-test runner here (npm test = Playwright e2e), so this is the
// proof that src/lib/wa/fact-guard.ts does what it claims. It runs against the
// REAL JAI_FACTS sheet, and every case ASSERTS on the validator's return value
// (ok + the exact tokens flagged), so a guard that silently stopped working
// fails this script.
//
// Cases marked [PROD] are replies that actually went out to customers.

import { validateReply, extractTimes, extractPrices, JMT_FACT_GUARD_CONFIG } from "../src/lib/wa/fact-guard.ts";
import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";

const opts = (customerText) => ({ customerText, config: JMT_FACT_GUARD_CONFIG });

/** @type {{name:string, reply:string, customer?:string, expect:"pass"|"block", tokens?:string[]}[]} */
const CASES = [
  // ── MUST BLOCK — the invented facts that cost money ──────────────────────
  {
    name: "[PROD 2026-07-20 / 2026-08-31] invented 7:00-8:00pm All-Levels class",
    reply:
      "Hey! Our evening All-Levels classes run at 7:00-8:00pm and 7:30-8:30pm — both great for beginners 🥊",
    expect: "block",
    tokens: ["19:00", "20:00"],
  },
  {
    name: "bare '7pm class' asserted with no customer prompt",
    reply: "Yes, we have a 7pm class on Monday!",
    expect: "block",
    // Blocked twice over: 7pm is in no schedule line at all, AND it is not a
    // Monday start time. Both are correct.
    tokens: ["19:00", "19:00@mon"],
  },
  {
    name: "dot-separated invented time (7.15pm)",
    reply: "Come down for the 7.15pm session 👍",
    expect: "block",
    tokens: ["19:15"],
  },
  {
    // Only 9am is flagged: 10am IS a real class start (Sat Kids 10:00–10:45am).
    // The guard checks each endpoint against the sheet, not the range as a
    // unit — checking ranges would block honest spans like "we run 6:30pm till
    // 9:30pm". One flagged token is enough to block the reply.
    // Also caught by day binding — Sunday has no group classes at all.
    name: "invented Sunday morning class",
    reply: "There's a 9-10am class on Sunday.",
    expect: "block",
    tokens: ["09:00", "09:00-10:00@sun"],
  },
  {
    name: "invented price ($199/month)",
    reply: "Adults unlimited is $199/month.",
    expect: "block",
    tokens: ["$199"],
  },
  {
    name: "invented trial fee ($20 trial — the demo-mode mistake)",
    reply: "The trial is just $20, then we can sort a membership out 🙂",
    expect: "block",
    tokens: ["$20"],
  },
  {
    name: "invented link (wrong booking domain)",
    reply: "Book here: https://jaimuaythai.com/trial-signup",
    expect: "block",
    tokens: ["jaimuaythai.com/trial-signup"],
  },
  {
    name: "invented calendly slug",
    reply: "Grab a slot: https://calendly.com/jaimuaythaisg/adult-trial",
    expect: "block",
    tokens: ["calendly.com/jaimuaythaisg/adult-trial"],
  },
  {
    name: "customer's wrong time affirmed (echo WITHOUT a correction cue)",
    reply: "Yes! 7pm works, see you then 🥊",
    customer: "can I come at 7pm?",
    expect: "block",
    tokens: ["19:00"],
  },
  {
    name: "mixed: one good time, one invented",
    reply: "We run 6:30-7:30pm and 8:00-9:00pm.",
    expect: "block",
    tokens: ["20:00", "21:00"],
  },

  // ── MUST PASS — real facts, quoted or reformatted ────────────────────────
  {
    name: "real evening classes, sheet formatting (en-dash)",
    reply: "Evening All-Levels are 6:30–7:30pm and 7:30–8:30pm 🥊",
    expect: "pass",
  },
  {
    name: "same times, hyphen + no minutes + spaces (formatting must not block)",
    reply: "We've got 6.30 - 7.30 pm and 7.30 - 8.30 pm classes.",
    expect: "pass",
  },
  {
    name: "meridiem inheritance across a range (7-8am = 7:00am)",
    reply: "Morning class is 7-8am on Mon, Wed and Fri.",
    expect: "pass",
  },
  {
    name: "'to' as the range separator",
    reply: "Lunch class runs 12:15 to 1:15pm.",
    expect: "pass",
  },
  {
    name: "11:30am-12:30pm — inheritance must NOT make the start 11:30pm",
    reply: "Saturday All-Levels is 11:30am–12:30pm.",
    expect: "pass",
  },
  {
    name: "single time quoted on its own",
    reply: "The 8:30pm Advanced class on Tuesday is the one you want.",
    expect: "pass",
  },
  {
    name: "correct prices, all tiers",
    reply:
      "Adults unlimited: 1 month $280, 3 months $250/month, 6 months $230/month. Drop-in is $42 and a 10-class pack is $35/class.",
    expect: "pass",
  },
  {
    // Was written expecting a pass against July's sheet. $80 was REMOVED from
    // the sheet on 2026-07-16 (1-to-1 is quoted differently now), so the sheet
    // no longer contains it and blocking is the correct behaviour.
    name: "PT price that is no longer in the sheet ($80)",
    reply: "PT starts from $80/session — Coach Jeremy handles those directly.",
    expect: "block",
  },
  {
    // Same story, and this one matters: the ADULT muay-thai trial Calendly link
    // was deliberately switched off (commit b07d232, "block dead adult trial
    // link in outbound"). Only the two KIDS links remain in the sheet. So the
    // guard blocking it is not a false positive — it is a second, independent
    // net under a bug that already reached customers once.
    name: "dead adult trial link the sheet no longer carries",
    reply:
      "Book here: https://calendly.com/jaimuaythaisg/muay-thai-trial-class?month=2026-09&name=Sam",
    expect: "block",
  },
  {
    // The query-string/prefill stripping still needs proving — do it with a
    // link the sheet DOES carry.
    name: "live kids trial link with a tracking/prefill query string",
    reply:
      "Book here: https://calendly.com/jaimuaythaisg/kids-muay-thai-trial-class?month=2026-09&name=Sam",
    expect: "pass",
  },
  {
    name: "correct link with a trailing full stop and trailing slash",
    reply: "Pay and book at https://jaimuaythai.com/booking/.",
    expect: "pass",
  },
  {
    name: "google maps link from the sheet",
    reply: "We're at Link@AMK — map here: https://maps.app.goo.gl/NExDxhC3KehaLiVK8",
    expect: "pass",
  },
  {
    name: "runtime wa.me link (allowlisted — built at runtime, never in the sheet)",
    reply: "You can also message us on https://wa.me/6592383071 👍",
    expect: "pass",
  },

  // ── FALSE-POSITIVE TRAPS — numbers that are NOT times or prices ──────────
  {
    name: "trap: years ('since 2006', 'in 2011')",
    reply: "We've been running since 2006 and Coach Jeremy has coached since 2011.",
    expect: "pass",
  },
  {
    name: "trap: ages and age bands (6-10, 11-14, 3+, 15 and above, under 21)",
    reply:
      "Kids is ages 6–10, Pre-Teen 11–14. We take from age 3+ for private sessions, 15 and above trains with adults, and anyone under 21 needs a parent's okay.",
    expect: "pass",
  },
  {
    name: "trap: phone number (+65 9238 3071)",
    reply: "Call or WhatsApp us at +65 9238 3071 any time.",
    expect: "pass",
  },
  {
    name: "trap: counts ('6 to 12 people', 'capped at 8')",
    reply: "Kids classes are small — 6 to 12 people, capped at 8.",
    expect: "pass",
  },
  {
    name: "trap: durations and percentages (15-minute buffer, 24 hours, 10% discount)",
    reply:
      "We hold a 15-minute buffer for all classes, cancel within 24 hours if you can, and there's a 10% discount for 3- or 6-month upfront.",
    expect: "pass",
  },
  {
    name: "trap: freeze policy numbers (minimum 2 weeks, 3-6 months to advance)",
    reply: "Freeze is a minimum of 2 weeks. Most people take 3–6 months before Advanced.",
    expect: "pass",
  },
  {
    name: "trap: address digits (3 Ang Mo Kio St 62, #03-17, S569139)",
    reply:
      "We're at Link@AMK, 3 Ang Mo Kio St 62, #03-17, Singapore 569139 — nearest MRT is Yio Chu Kang.",
    expect: "pass",
  },
  {
    name: "trap: a date, not a time (2026-09-01)",
    reply: "Your trial is on 2026-09-01, see you then!",
    expect: "pass",
  },
  {
    name: "trap: customer's wrong time echoed inside a CORRECTION",
    reply:
      "We don't have a 7pm class, sorry! The closest ones are 6:30-7:30pm and 7:30-8:30pm 🙂",
    customer: "is there a 7pm class on Monday?",
    expect: "pass",
  },
  {
    name: "trap: customer's wrong price echoed inside a CORRECTION",
    reply: "It's not $199 — adults unlimited is $280 for 1 month.",
    customer: "is it $199 a month?",
    expect: "pass",
  },
  {
    name: "trap: nonsense clock values are not times ('13pm', '7:75pm' in a typo echo)",
    reply: "Sorry, 13pm and 7:75pm aren't real times — did you mean 7:30pm?",
    expect: "pass",
  },
  {
    name: "trap: no numbers at all",
    reply: "Totally! Most of our members started at zero — the coaches guide you step by step 🥊",
    expect: "pass",
  },
];

// ── run ──────────────────────────────────────────────────────────────────────
let failed = 0;
console.log(`Fact guard — ${CASES.length} cases against the REAL JAI_FACTS sheet\n`);

for (const c of CASES) {
  const res = validateReply(c.reply, JAI_FACTS, opts(c.customer));
  const got = res.ok ? "pass" : "block";
  const norms = res.violations.map((v) => v.normalised).sort();
  let problem = null;

  if (res.error) problem = `validator errored (failed open): ${res.error}`;
  else if (got !== c.expect) {
    problem =
      c.expect === "block"
        ? "expected a BLOCK, reply would have been SENT"
        : `expected PASS, blocked on [${res.violations.map((v) => `${v.kind} ${v.token}`).join(", ")}]`;
  } else if (c.tokens) {
    const want = [...c.tokens].sort();
    if (JSON.stringify(norms) !== JSON.stringify(want))
      problem = `blocked, but on [${norms.join(", ")}] instead of [${want.join(", ")}]`;
  }

  if (problem) {
    failed++;
    console.log(`FAIL  ${c.name}\n      ${problem}`);
  } else {
    const detail = res.ok ? "" : `  (blocked on ${norms.join(", ")})`;
    console.log(`ok    ${c.name}${detail}`);
  }
}

// ── normalisation unit checks (consume the return value) ────────────────────
console.log("\nNormalisation spot-checks");
const NORM = [
  ["6:30-7:30pm", ["18:30", "19:30"]],
  ["6.30–7.30 pm", ["18:30", "19:30"]],
  ["10-11am", ["10:00", "11:00"]],
  ["11:30am–12:30pm", ["11:30", "12:30"]],
  ["12:15 to 1:15pm", ["12:15", "13:15"]],
  ["7 pm", ["19:00"]],
  ["12am", ["00:00"]],
  ["12pm", ["12:00"]],
  ["ages 6-10 and 11-14", []],
  ["+65 9238 3071", []],
  ["since 2006", []],
];
for (const [input, want] of NORM) {
  const got = extractTimes(input).map((t) => t.norm);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok   " : "FAIL "} times("${input}") -> [${got.join(", ")}]`);
}
const NORM_PRICE = [
  ["RM250", ["RM250"]],
  ["RM 250", ["RM250"]],
  ["RM250/month", ["RM250"]],
  ["RM1,400", ["RM1400"]],
  ["MYR 1400.00", ["RM1400"]],
  ["$250/month and S$42", ["$250", "$42"]],
  ["10% discount, 8 people, 2 weeks", []],
];
for (const [input, want] of NORM_PRICE) {
  const got = extractPrices(input).map((t) => t.norm);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok   " : "FAIL "} prices("${input}") -> [${got.join(", ")}]`);
}

// ── fail-open check: a broken sheet/reply must never throw ──────────────────
const weird = validateReply("", JAI_FACTS, {});
if (!weird.ok) {
  failed++;
  console.log("FAIL  empty reply must pass");
}

console.log(`\n${failed === 0 ? "ALL CASES PASSED" : `${failed} CASE(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
