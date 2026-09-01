import { lateArrivalAnswer } from "../src/lib/wa/deterministic-answers.ts";
// Real customer phrasings from the live inbox + round-5 probes.
const cases = [
  ["oh so if i reach at 745 its ok ? for the 730 class", false],   // Kenneth, with the class time added by ME
  ["i'll reach at 645 for the 630 class",                false],   // exactly 15 -> refused
  ["about 10 mins late for the 6.30pm class, ok?",       true ],
  ["i might be 20 minutes late for the 7.30pm class",    false],
  ["i might only reach fifteen minutes after it starts", false],
  ["i booked the 730pm class but i'll only reach at 8pm", false],
  ["i'll be 5 mins late",                                 true ],
  // Morning classes are real (Mon/Wed/Fri 7:00-8:00am). Round 6: a bare arrival
  // hour was forced to PM, so 7.05 vs a 7am class read as 725 minutes late and
  // a member got a confident refusal.
  ["i'll reach at 7.05 for the 7am class",                true ],
  ["coming for the 7am class, will reach 7.10",           true ],
  ["reach at 7.20 for the 7am class",                     false],
  ["i'll reach 7.05am for the 7.00am class",              true ],
];
let fail = 0;
for (const [msg, canJoin] of cases) {
  const a = lateArrivalAnswer(msg);
  if (!a) { fail++; console.log("MISS  ", msg); continue; }
  if (a.canJoin !== canJoin) { fail++; console.log(`WRONG  want canJoin=${canJoin} got ${a.canJoin} :: ${msg}`); }
  else console.log(`ok    canJoin=${a.canJoin} :: ${msg}`);
}
// must NOT fire on things that are not about lateness.
// This intercept runs before the model AND before the greeting, so a false fire
// sends a class refusal to someone who never asked about a class.
for (const msg of [
  "what time is the monday class?",
  "how much is the 10 class pack?",
  "sorry i was late replying",
  "sorry for the late reply, still interested",
  "i was 20 minutes late to work today haha",
  "i got 10 mins late to the office",
  "is it too late to sign up for the promo?",
  "is it too late to join this month?",
]) {
  if (lateArrivalAnswer(msg)) { fail++; console.log("FALSE+", msg); } else console.log("ok    no trigger ::", msg);
}

// ── Kenneth's REAL thread ────────────────────────────────────────────────────
// Round 7: the case above passes only because I appended "for the 730 class".
// He never wrote that — the class time is three turns back — so the intercept
// found no class, returned null, and the model told him "you're good to join".
// A test that quietly repairs the input is not a test.
const kennethThread = [
  "hi",
  "can i come today ?",
  "Today's Tuesday, so we've got All-Levels classes at 6:30-7:30pm and 7:30-8:30pm tonight",
  "too late",
  "The 7:30pm class starts soon",
];
{
  const a = lateArrivalAnswer("oh so if i reach at 745 its ok ?", undefined, kennethThread);
  if (!a) { fail++; console.log("MISS   Kenneth's real message (class time in an earlier turn)"); }
  else if (a.canJoin !== false) { fail++; console.log(`WRONG  Kenneth: want canJoin=false got ${a.canJoin}`); }
  else console.log("ok    canJoin=false :: Kenneth's real message, class time three turns back");
}
{
  // and it must still not fire when nothing anywhere names a class
  const a = lateArrivalAnswer("oh so if i reach at 745 its ok ?", undefined, ["hi", "what are your rates?"]);
  if (a) { fail++; console.log("FALSE+ fired with no class in context"); }
  else console.log("ok    no trigger :: arrival time but no class anywhere");
}

console.log(fail === 0 ? "\nALL LATE-ARRIVAL CASES PASSED" : `\n${fail} FAILED`);
