// Cases from e2e round 4, which judged the substitution "materially worse".
import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";
import { statesAClassTime, daysNamedIn, looksNonEnglish } from "../src/lib/wa/fact-guard.ts";
import { scheduleAnswerForDay } from "../src/lib/wa/deterministic-answers.ts";

let fail = 0;
const t = (name, cond, extra="") => { if (!cond) { fail++; console.log("FAIL ", name, extra); } else console.log("ok   ", name); };

// 1. the loop: a day named in the draft must resolve to that day's answer
for (const [draft, want] of [
  ["For sure! We've got an All-Levels class at 7:30pm on Mondays.", "Mon"],
  ["Wednesday evening it is — 6:30pm or 7:30pm?", "Wed"],
  ["the only class Thursday is our Advanced at 8:30–9:30pm", "Thu"],
  ["Saturday morning we run 10:00–10:45am kids", "Sat"],
]) {
  const day = daysNamedIn(draft)[0];
  t(`day from draft: ${want}`, day === want, `got ${day}`);
  const ans = scheduleAnswerForDay(day, JAI_FACTS);
  t(`  answer built for ${want}`, !!ans && ans.messageText.includes(want));
}

// 2. "Monday. I just told you." — day comes from the customer when the draft has none
t('day from customer msg', daysNamedIn("Monday. I just told you.")[0] === "Mon");

// 3. multilingual day extraction
t('zh 星期三 -> Wed', daysNamedIn("星期三几点上课？")[0] === "Wed");
t('ms Rabu -> Wed',   daysNamedIn("Kelas hari Rabu pukul berapa?")[0] === "Wed");

// 4. the Malay time escape that walked past round 3+4
t('ms pagi/petang caught',
  statesAClassTime("Untuk kelas Rabu, ada: 7:00–8:00 pagi (All Levels), 6:30–7:30 petang"));
t('zh bare range caught', statesAClassTime("星期三的课是 7:00–8:00 和 6:30–7:30。"));
t('24h caught',           statesAClassTime("Wednesday classes are at 19:30 and 20:30."));
t('bare range caught',    statesAClassTime("Wednesday we run 7:00-8:00 and 6:30-7:30."));

// 5. language detection so a zh/ms lead is not answered in English canned copy
t('zh detected', looksNonEnglish("星期三几点上课？"));
t('ms detected', looksNonEnglish("Kelas hari Rabu pukul berapa?"));
t('en not flagged', !looksNonEnglish("What time is the Wednesday class?"));

// 6. no false trigger on replies stating no timetable
for (const r of ["Our head coach is Melvin Yeoh.", "Drop-in is $42.", "We're at Link@AMK."])
  t(`no trigger: ${r.slice(0,22)}`, !statesAClassTime(r));

console.log(fail === 0 ? "\nALL SUBSTITUTION CASES PASSED" : `\n${fail} FAILED`);
