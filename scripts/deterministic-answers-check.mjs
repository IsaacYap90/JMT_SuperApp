// Layer 2 check — runs the real intent detector + answer builder against the
// REAL fact sheet and asserts on what comes back.
//
//   node scripts/deterministic-answers-check.mjs
//
// No test framework (npm test here is Playwright e2e). Node >= 22.6 strips the
// TypeScript types on import, so this loads the actual shipped modules — not a
// copy. Exit code 0 = all pass, 1 = something regressed.
//
// The point of the "must NOT intercept" half is the expensive failure mode: a
// wrong interception sends a real customer a canned answer to a question they
// didn't ask. Those cases matter more than the hits.

import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";
import {
  buildDeterministicAnswer,
  detectIntent,
  parseSchedule,
  parsePricing,
} from "../src/lib/wa/deterministic-answers.ts";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

// ── 1. The sheet parses ──────────────────────────────────────────────────────
console.log("\n[1] Fact-sheet parsing");
const sched = parseSchedule(JAI_FACTS);
const pricing = parsePricing(JAI_FACTS);
check("schedule section parses", !!sched);
check("7 day lines found", sched?.days.length === 7, `got ${sched?.days.length}`);
check(
  "Mon has 4 slots, first is 7:00–8:00am",
  sched?.days[0].entries.length === 4 && sched?.days[0].entries[0].text.startsWith("7:00–8:00am"),
  JSON.stringify(sched?.days[0].entries.map((e) => e.text))
);
check(
  "AL is expanded to 'All Levels' (never sent as jargon)",
  sched?.days[0].entries[0].text.includes("All Levels") &&
    !/\bAL\b/.test(sched?.days[0].entries.map((e) => e.text).join(" ") ?? "AL"),
  sched?.days[0].entries[0].text
);
check(
  "start hours read correctly (12:15–1:15pm = 12h, 6:30–7:30pm = 18h)",
  sched?.days[0].entries[1].startHour === 12 && sched?.days[0].entries[2].startHour === 18,
  JSON.stringify(sched?.days[0].entries.map((e) => [e.text, e.startHour]))
);
check("pricing section parses", !!pricing);
check(
  "Adults tier first option is the 1-month rate",
  pricing?.tiers[0].label.startsWith("Adults") && pricing?.tiers[0].firstOption === "1 month $280",
  JSON.stringify(pricing?.tiers[0])
);
check(
  "drop-in line is classified as drop-in, not a membership tier",
  pricing?.tiers.find((t) => /Drop-in/i.test(t.label))?.isDropIn === true,
  JSON.stringify(pricing?.tiers.map((t) => [t.label, t.isDropIn]))
);

// ── 2. Messages that MUST be intercepted ─────────────────────────────────────
console.log("\n[2] Must intercept");
const hits = [
  { msg: "what time is the monday class?", intent: "SCHEDULE", must: ["6:30–7:30pm", "7:30–8:30pm"], mustNot: ["7:00–8:00pm"] },
  { msg: "Wednesday what time ah", intent: "SCHEDULE", must: ["7:30–8:30pm Advanced"], mustNot: ["8:30–9:30pm"] },
  { msg: "timetable for saturday", intent: "SCHEDULE", must: ["10:00–10:45am", "11:30am–12:30pm"] },
  { msg: "jadual kelas hari jumaat", intent: "SCHEDULE", must: ["8:30–9:30pm Sparring"] },
  { msg: "星期二几点上课", intent: "SCHEDULE", must: ["4:30–5:15pm"] },
  { msg: "do you have morning class?", intent: "SCHEDULE", must: ["7:00–8:00am"], mustNot: ["6:30–7:30pm"] },
  { msg: "what time are the evening classes on thursday", intent: "SCHEDULE", must: ["6:30–7:30pm"], mustNot: ["12:15–1:15pm"] },
  { msg: "when are your classes?", intent: "SCHEDULE", must: ["Which day"] },
  { msg: "how much per month?", intent: "PRICE", must: ["1 month $280"], mustNot: ["3 months", "6 months", "$42"] },
  { msg: "whats the price for classes", intent: "PRICE", must: ["$280"] },
  { msg: "berapa harga sebulan", intent: "PRICE", must: ["$280"] },
  { msg: "多少钱一个月", intent: "PRICE", must: ["$280"] },
  { msg: "how much for my son", intent: "PRICE", must: ["1 month $250", "Kids"], mustNot: ["$280"] },
  { msg: "kids fee?", intent: "PRICE", must: ["$250"] },
  { msg: "sunday got class what time", intent: "SCHEDULE", must: ["no group classes"], mustNot: ["•"] },
  { msg: "how much is your monthly membership", intent: "PRICE", must: ["1 month $280"] },
];
for (const t of hits) {
  const a = buildDeterministicAnswer(t.msg, JAI_FACTS);
  if (!a) {
    check(`"${t.msg}" → ${t.intent}`, false, "not intercepted (returned null)");
    continue;
  }
  const okIntent = a.intent === t.intent;
  const missing = (t.must || []).filter((s) => !a.messageText.includes(s));
  const leaked = (t.mustNot || []).filter((s) => a.messageText.includes(s));
  const noMdBold = !a.messageText.includes("**");
  check(
    `"${t.msg}" → ${t.intent}`,
    okIntent && missing.length === 0 && leaked.length === 0 && noMdBold,
    [
      okIntent ? "" : `intent=${a.intent}`,
      missing.length ? `missing ${JSON.stringify(missing)}` : "",
      leaked.length ? `leaked ${JSON.stringify(leaked)}` : "",
      noMdBold ? "" : "markdown **bold** in reply",
      `reply: ${JSON.stringify(a.messageText)}`,
    ]
      .filter(Boolean)
      .join(" | ")
  );
}

// ── 3. Messages that MUST NOT be intercepted ─────────────────────────────────
console.log("\n[3] Must fall through to the AI");
const misses = [
  "hi",
  "hello, is anyone there?",
  "can i book a free trial",
  "what time is my trial tomorrow?",
  "how much is the trial class",
  "is there a 7:30pm trial slot?",
  "how much is a drop in class",
  "how much for personal training",
  "pt price?",
  "i want to freeze my membership for 2 weeks",
  "can i renew my membership",
  "where are you located",
  "which mrt is nearest",
  "what should i bring for class",
  "is it ok for beginners with no experience?",
  "how old must my kid be",
  "monday",
  "tonight",
  "what time do you close and how much is a membership?",
  "hey coach, i signed up last month and i've been training tuesdays but my knee has been sore since the sparring class so i wanted to ask what you'd suggest",
  "do you have any discount for students?",
  "can my company book a group session and how much would that cost",
  "i'm running late for the 6:30 class",
  "ok see you tonight",
  "thanks! monthly ok",
  "my friend said the tuesday one is good",
];
for (const msg of misses) {
  const det = detectIntent(msg);
  const a = buildDeterministicAnswer(msg, JAI_FACTS);
  check(
    `"${msg}" → AI`,
    a === null,
    a ? `INTERCEPTED as ${a.intent} (${det.reason || `score ${det.score}`}): ${JSON.stringify(a.messageText)}` : ""
  );
}

// ── 4. Broken / edited sheet degrades to the AI, never to a wrong message ────
console.log("\n[4] Sheet edits degrade to the AI");
const noSchedule = JAI_FACTS.replace("=== CLASS SCHEDULE (Mon–Sat; AL = All Levels) ===", "=== TIMES ===");
check(
  "renamed schedule header → null, not empty/garbled",
  buildDeterministicAnswer("what time is monday class", noSchedule) === null
);
const noPricing = JAI_FACTS.replace("=== GROUP-CLASS PRICING ===", "=== WHAT IT COSTS ===");
check("renamed pricing header → null", buildDeterministicAnswer("how much per month", noPricing) === null);
const reformatted = JAI_FACTS.replace(/^- (Mon|Tue|Wed|Thu|Fri|Sat|Sun):/gm, "$1 |");
check(
  "day lines reformatted → null",
  buildDeterministicAnswer("what time is monday class", reformatted) === null
);
const pricesAsProse = JAI_FACTS.replace(/^- (Adults|Kids \/ Pre-Teen).*$/gm, "See the rates page.");
check(
  "price lines turned into prose → null",
  buildDeterministicAnswer("how much per month", pricesAsProse) === null
);
check("empty sheet → null", buildDeterministicAnswer("what time is monday class", "") === null);
check(
  "prices removed but schedule intact → schedule still answers",
  buildDeterministicAnswer("what time is monday class", pricesAsProse) !== null
);

// ── 5. Sample output, eyeballed ──────────────────────────────────────────────
console.log("\n[5] Sample replies");
for (const m of ["what time is the class on tuesday", "how much per month?", "when are your classes?"]) {
  const a = buildDeterministicAnswer(m, JAI_FACTS);
  console.log(`\n  > ${m}\n${a.messageText.split("\n").map((l) => `    ${l}`).join("\n")}`);
  console.log(`    [buttons: ${a.quickReplies.join(", ")}]`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log("Failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
