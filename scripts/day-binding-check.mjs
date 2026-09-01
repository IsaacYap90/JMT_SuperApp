import { JAI_FACTS } from "../src/lib/wa/jai-facts.ts";
import { validateReply, indexSchedule, JMT_FACT_GUARD_CONFIG } from "../src/lib/wa/fact-guard.ts";

const sched = indexSchedule(JAI_FACTS);
console.log("parsed days:", [...sched.keys()].join(",") || "(none)");
for (const [d, e] of sched) console.log(`  ${d}: ranges ${[...e.ranges].join(" ")}`);

const cases = [
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
