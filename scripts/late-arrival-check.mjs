import { lateArrivalAnswer } from "../src/lib/wa/deterministic-answers.ts";
// Real customer phrasings from the live inbox + round-5 probes.
const cases = [
  ["oh so if i reach at 745 its ok ? for the 730 class", false],   // Kenneth, 31 Aug — the live failure
  ["i'll reach at 645 for the 630 class",                false],   // exactly 15 -> refused
  ["about 10 mins late for the 6.30pm class, ok?",       true ],
  ["i might be 20 minutes late for the 7.30pm class",    false],
  ["i might only reach fifteen minutes after it starts", false],
  ["i booked the 730pm class but i'll only reach at 8pm", false],
  ["i'll be 5 mins late",                                 true ],
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
console.log(fail === 0 ? "\nALL LATE-ARRIVAL CASES PASSED" : `\n${fail} FAILED`);
