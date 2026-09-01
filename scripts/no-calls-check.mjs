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
console.log(fail === 0
  ? `\nALL NO-CALL CASES PASSED — ${mustCatch.length} caught, ${mustPass.length} left alone`
  : `\n${fail} FAILED`);
