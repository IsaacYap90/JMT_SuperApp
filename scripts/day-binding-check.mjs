import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";
import { validateReply, indexSchedule, JMT_FACT_GUARD_CONFIG } from "../src/lib/wa/fact-guard.ts";

const sched = indexSchedule(JAI_FACTS);
console.log("parsed days:", [...sched.keys()].join(",") || "(none)");
for (const [d, e] of sched) console.log(`  ${d}: ranges ${[...e.ranges].join(" ")}`);

// Every case below came out of a real e2e run against the live model: the
// escapes it found, and the correct replies the first day-check wrongly
// blocked. Both directions are regressions worth keeping.
const cases = [
  ["BLOCK", "There's an 8:30pm class on Wednesdays", "block"],
  ["BLOCK", "We have an 8:30pm class on Tuesdays, Wednesdays, Thursdays and Fridays", "block"],
  ["BLOCK", "Kids classes run 4:30-6:00pm on Tuesdays", "block"],
  ["BLOCK", "On Wednesdays the Advanced class is 8:30-9:30pm", "block"],
  ["BLOCK", "Sundays we run a 10am group class", "block"],
  ["BLOCK", "there's an 8:30pm Advanced/Sparring class on Tue, Wed, Thu and Fri", "block"],
  ["BLOCK", "plus Kids & Pre-Teen classes 4:30-6:00pm on Tuesday", "block"],
  ["BLOCK", "Yes, we have a 7pm class on Monday!", "block"],
  ["PASS", "Kids (6-10) class is Tue & Thu 4:30-5:15pm, and Sat 10:00-10:45am", "pass"],
  ["PASS", "our evening All-Levels classes run Mon & Wed at 6:30pm and 7:30pm, Tue & Thu at 6:30pm, 7:30pm and 8:30pm, and Fri at 6:30pm, 7:30pm and 8:30pm Sparring", "pass"],
  ["PASS", "Monday has a 7am class and Tuesday starts at 12:15pm", "pass"],
  ["PASS", "Kids classes are Tue and Thu at 4:30pm, and Saturday at 10am", "pass"],
  ["PASS", "Mon and Wed we have a 7am class, Tue and Thu start at 12:15pm", "pass"],
  ["PASS", "Kids run Tue/Thu 4:30pm and Sat 10am", "pass"],
  ["PASS", "On weekdays we start at 7am but Saturday starts at 10am", "pass"],
  ["PASS", "I'll get Coach Jeremy to call you Monday around 6pm", "pass"],
  ["PASS", "Sunday is PT only - Coach Jeremy can do 10am if that suits", "pass"],
  ["PASS", "Monday classes are 6:30-7:30pm and 7:30-8:30pm", "pass"],
  ["PASS", "On Tuesdays our Kids class runs at 4:30-5:15pm", "pass"],
  ["PASS", "Wednesday evening is 6:30-7:30pm then 7:30-8:30pm All Levels", "pass"],
  ["PASS", "The 7:30pm class on Monday finishes at 8:30pm", "pass"],
  ["PASS", "We run classes Mon-Sat, 7:30-8:30pm most evenings", "pass"],
  // the two REAL failures the e2e observed in live model output
  ["BLOCK", "there's an 8:30pm Advanced/Sparring class on Tue, Wed, Thu and Fri", "block"],
  ["BLOCK", "plus Kids & Pre-Teen classes 4:30-6:00pm on Tuesday", "block"],
  // must still pass
  ["PASS", "Monday classes are 6:30-7:30pm and 7:30-8:30pm", "pass"],
  ["PASS", "On Tuesdays our Kids class runs at 4:30-5:15pm", "pass"],
  ["PASS", "There's no 8pm class on Mondays - the evening ones are 6:30pm and 7:30pm", "pass"],
  ["PASS", "We run classes Mon-Sat, 7:30-8:30pm most evenings", "pass"],
  ["PASS", "Wednesday evening is 6:30-7:30pm then 7:30-8:30pm Advanced", "pass"],
  ["PASS", "Our coach is Jeremy and we're in Ang Mo Kio", "pass"],
];
let fail = 0;
for (const [label, reply, expect] of cases) {
  const r = validateReply(reply, JAI_FACTS, { config: JMT_FACT_GUARD_CONFIG });
  const got = r.ok ? "pass" : "block";
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} [${label}] ${got}${r.violations.length ? " -> " + r.violations.map(v=>`${v.kind}:${v.normalised}`).join(", ") : ""}`);
  if (!ok) console.log(`        reply: ${reply}`);
}
console.log(fail === 0 ? "\nALL DAY-BINDING CASES PASSED" : `\n${fail} FAILED`);
