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

// ── Kenneth's thread ────────────────────────────────────────────────────────
// READ THIS BEFORE EDITING. The fixture that used to sit here was labelled
// "JAI's ACTUAL wording, copied from the live thread". It was not. I wrote the
// one sentence shape CLASS_RE needed - "The 7:30pm All-Levels class starts in
// about 15 mins" - and across four live replays of this conversation JAI never
// produced anything of that shape. Its real turn-4 replies were "we hold a
// 15-minute buffer for all classes" (no time before the word), "our 6:30pm
// class starts in just over an hour", and a timetable. So the suite reported
// this case fixed while the live system answered it correctly about half the
// time and, once, told the customer the wrong thing.
//
// The cases below are therefore JAI's real observed phrasings, kept verbatim,
// including the two the intercept CANNOT parse. Two of them assert null on
// purpose: that is the honest state of this feature, not a passing grade.
const kennethTurn4 = {
  // observed live, run 1 - parses
  withClassPhrase: "Sounds good! The 6:30pm or 7:30pm All-Levels class would be great for you.",
  // observed live, run 2 - no time before "classes", so no class is found
  bufferOnly: "No worries at all! We hold a 15-minute buffer for all classes.",
  // observed live, run 3 - times come AFTER the word, and an em dash splits it
  timesAfter: "Our evening classes are at 6:30pm and 7:30pm \u2014 both All-Levels.",
};
{
  const a = lateArrivalAnswer("oh so if i reach at 745 its ok ?", undefined,
    ["hi", "can i come today ?", kennethTurn4.withClassPhrase, "too late"]);
  if (!a) { fail++; console.log("MISS   Kenneth, JAI phrased it with '7:30pm All-Levels class'"); }
  else if (a.canJoin !== false) { fail++; console.log(`WRONG  Kenneth: want canJoin=false got ${a.canJoin}`); }
  else console.log("ok    canJoin=false :: Kenneth, class named in an earlier turn");
}
for (const [name, turn] of [["buffer-only reply", kennethTurn4.bufferOnly],
                            ["times-after reply", kennethTurn4.timesAfter]]) {
  const a = lateArrivalAnswer("oh so if i reach at 745 its ok ?", undefined,
    ["hi", "can i come today ?", turn, "too late"]);
  // Documented gap, not a pass: with these real phrasings the intercept finds
  // no class and the boundary falls back to the model, which has answered it
  // wrongly in production. Asserting the gap keeps it visible.
  if (a) console.log(`ok    NOW PARSES (${name}) - tighten the assertion`);
  else console.log(`gap   returns null (${name}) - boundary handed to the model`);
}
{
  const a = lateArrivalAnswer("oh so if i reach at 745 its ok ?", undefined, ["hi", "what are your rates?"]);
  if (a) { fail++; console.log("FALSE+ fired with no class in context"); }
  else console.log("ok    no trigger :: arrival time but no class anywhere");
}

// Code review, 1 Sep: the intercept answered these with the canned class
// refusal, skipping the model AND the MANDATORY TRIAL_CANCEL / PT escalation,
// so a missed trial slot stayed blocked and its reminders kept firing.
for (const [name, msg] of [
  ["trial", "hi can my son still do his trial if we reach 20 mins late?"],
  ["PT", "im gonna be 20 mins late for my PT session with jeremy"],
]) {
  if (lateArrivalAnswer(msg, undefined, ["hi"])) {
    fail++; console.log(`SWALLOW ${name} message answered by the intercept - escalation lost`);
  } else console.log(`ok    hands back to the model :: ${name} + late`);
}

console.log(fail === 0 ? "\nALL LATE-ARRIVAL CASES PASSED" : `\n${fail} FAILED`);
