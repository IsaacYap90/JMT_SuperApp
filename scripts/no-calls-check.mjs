import { offersAPhoneCall } from "../src/lib/wa/fact-guard.ts";
// The real 1 Sep reply is the first case: a lead wrote "Call me" and JAI handed
// her the gym number to dial herself, with no escalation raised.
const mustCatch = [
  "Hey EVY! No worries — you can reach us directly at +65 9238 3071. That's our WhatsApp and phone line, so feel free to call or text anytime.",
  "I'll give you a call later today",
  "I can call you this afternoon if that's easier",
  "Give us a ring on +65 9238 3071",
  "Feel free to call us anytime",
  "You can call us at +65 9238 3071",
];
const mustPass = [
  "Our number is +65 9238 3071 if you'd like to save it.",
  "Coach Jeremy will WhatsApp you shortly.",
  "We're at Link@AMK, #03-17.",
  "Drop-in is $42 and the 10-class pack is $35/class.",
  "Monday classes are 6:30-7:30pm and 7:30-8:30pm.",
];
let fail = 0;
for (const t of mustCatch) if (!offersAPhoneCall(t)) { fail++; console.log("MISS  ", t.slice(0, 58)); }
for (const t of mustPass) if (offersAPhoneCall(t)) { fail++; console.log("FALSE+", t.slice(0, 58)); }

// ── round-10: prose cut-off claims ──────────────────────────────────────────
import { claimsACutoffTime, isLateArrivalReply } from "../src/lib/wa/fact-guard.ts";
let f2 = 0;
const t = (n, c) => { if (!c) { f2++; console.log("FAIL ", n); } else console.log("ok   ", n); };

// Both of these reached customers. Both are inverted: 6:45 and 7:45 are the
// cut-off itself, which the sheet says is already too late.
t('"latest you can join is 6:45pm" caught',
  claimsACutoffTime("So for the 6:30pm class, the latest you can join is 6:45pm."));
t('"need to be there by 7:45pm" caught',
  claimsACutoffTime("For the 7:30pm class you'd need to be there by 7:45pm latest."));
t('"as long as you are in within 15 mins" caught',
  claimsACutoffTime("As long as you're in within 15 mins of the 6:30pm start, you're good to join."));
// The rule stated WITHOUT a clock time is correct and may stand.
t('rule with no time is left alone', !claimsACutoffTime("We hold a hard 15-minute cut-off for all classes."));
t('ordinary timetable left alone', !claimsACutoffTime("Monday classes are 6:30-7:30pm and 7:30-8:30pm."));

// "too late to join" is a correct refusal and must register as a late reply.
t('"too late to join" is a late reply',
  isLateArrivalReply("Sorry, 7:45pm is too late to join the 7:30pm class tonight."));
t('"never too late to start" is not',
  !isLateArrivalReply("It's never too late to start! Tuesday classes are 6:30-7:30pm."));

if (f2) { console.log(`\n${f2} FAILED`); process.exitCode = 1; }

console.log(fail === 0
  ? `\nALL NO-CALL CASES PASSED — ${mustCatch.length} caught, ${mustPass.length} left alone`
  : `\n${fail} FAILED`);
