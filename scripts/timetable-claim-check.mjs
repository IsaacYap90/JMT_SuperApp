import { statesAClassTime } from "../src/lib/wa/fact-guard.ts";
// Every escape the three e2e rounds found. None of these was caught by grading.
const mustCatch = [
  "Wednesday we go until 9:30pm.",
  "On Wednesdays you can come at 8:30pm.",
  "Wednesday evenings we're on the mats until 9:30pm.",
  "Wednesday 8:30pm works.",
  "No problem — Wednesday has an 8:30pm class.",
  "We don't run mornings on Tuesday, and Wednesday has an 8:30pm class.",
  "Mon-Fri we run an 8:30pm class.",
  "Wednesday has classes, but they start at 8:30pm.",
  "Wednesday classes are popular, though the last one starts at 8:30pm.",
  "PT is flexible, and our Sunday group class is at 10am.",
  "appointment aside, our Sunday group class is at 10am.",
  "For Wednesday we've got a later one too — the Advanced group goes 8:30–9:30pm.",
  "Our Wednesday timetable is packed right through the evening, and the final class starts at 8:30pm.",
  "- *Wed:* 9:30pm",
  "the better bet for you is to book a spot in the Sparring class at 8:30pm on Wednesday",
  // the language bypass — these skipped every English-only check
  "星期三的课是晚上8点半开始的。",
  "周三我们有8:30pm的课。",
  "Kelas hari Rabu bermula 8:30pm.",
  "Hari Isnin kelas pukul 7pm.",
];
// Must NOT trigger — no timetable claim, so the model's own words should stand.
const mustPass = [
  "Our head coach is Melvin Yeoh, he founded the gym in 2006.",
  "Drop-in is $42 and registration is $150 one-time.",
  "You don't need any gear for your first class — just shorts and a t-shirt.",
  "We're at Link@AMK, 3 Ang Mo Kio St 62, nearest MRT is Yio Chu Kang.",
  "Sure, I'll get Coach Jeremy to give you a call.",
];
let fail = 0;
for (const r of mustCatch) if (!statesAClassTime(r)) { fail++; console.log("MISS  ", r); }
for (const r of mustPass) if (statesAClassTime(r)) { fail++; console.log("FALSE+", r); }
console.log(fail === 0
  ? `\nALL ${mustCatch.length} escapes caught, ${mustPass.length} non-claims untouched`
  : `\n${fail} FAILED`);
