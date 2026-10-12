// The fact sheet forbids stating an age cut-off for the adult classes and has no
// parental-consent rule, yet both the brain and DeepSeek invented them for a
// 16-year-old (e2e C15, 2026-10-12). The age bands ARE in the sheet (for
// routing), so the plain fact guard let those replies through.
//
//   node --import ./scripts/ts-resolve.mjs scripts/age-rule-check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/lib/wa/jai-reply.ts", import.meta.url), "utf8");
const m = src.match(/const AGE_RULE =\s*(\/.*\/i);/);
assert.ok(m, "AGE_RULE not found in jai-reply.ts");
const AGE_RULE = eval(m[1]);

for (const t of [
  "Since you're 16, you'd need mum or dad in on it.",
  "Our adult classes (15 and up) run every weekday.",
  "As you're under 21, a parent or guardian will need to help with the booking.",
  "Teens & Adults are 15+.",
  "You'll need parental consent first.",
  "For adults (14+) it's our All-Levels class.",
]) assert.equal(AGE_RULE.test(t), true, t);

for (const t of [
  "Free trials for the adult classes are paused right now — the drop-in is $42: https://jaimuaythai.com/booking",
  "How old are they?",
  "The booking page still says 10–13 — don't worry, Coach Jeremy takes 14 in the Pre-Teen class too.",
  "Kids / Pre-Teen / Student / NSF (under 21) Unlimited: 1mo $250",
  "Parents are welcome to watch the kids class.",
  "Class sizes are 6 to 12 people.",
]) assert.equal(AGE_RULE.test(t), false, t);

// Draft 2 still broke the rule -> only the offending sentence is dropped, so the
// customer keeps the real answer (e2e C15).
const fn = src.match(/export function withoutAgeRuleSentences\(text: string\): string \{([\s\S]*?)\n\}/);
assert.ok(fn, "withoutAgeRuleSentences not found");
const strip = new Function("AGE_RULE", "text", fn[1]);
assert.equal(
  strip(AGE_RULE, "Free trials for adults are paused. Since you're under 21, a parent or guardian will need to help. The drop-in is $42: https://jaimuaythai.com/booking"),
  "Free trials for adults are paused. The drop-in is $42: https://jaimuaythai.com/booking"
);
assert.equal(strip(AGE_RULE, "Our adult classes (15 and up) are great."), "");

// The sheet: "The bot never approves a freeze or promises a date itself." A DeepSeek
// fallback said "Yes, we can freeze your membership" (e2e v5 C25); 5 past live
// replies said "We can definitely freeze your membership".
const pm = src.match(/const POLICY_APPROVAL =\s*(\/.*\/i);/);
assert.ok(pm, "POLICY_APPROVAL not found");
const POLICY_APPROVAL = eval(pm[1]);
for (const t of [
  "Yes, we can freeze your membership 🙏 your November trip qualifies.",
  "We can definitely freeze your membership — minimum 2 weeks.",
  "Sure, I can pause it for 3 weeks.",
  "Your refund is approved.",
]) assert.equal(POLICY_APPROVAL.test(t), true, t);
for (const t of [
  "Freezes are handled by Coach Jeremy — I've passed this to him.",
  "I can't approve a freeze myself, but Coach Jeremy will help.",
  "Freeze is minimum 2 weeks, for medical reasons or overseas travel only — Coach Jeremy sets it up.",
  "Sure — the drop-in is $42.",
]) assert.equal(POLICY_APPROVAL.test(t), false, t);

console.log("age-rule-check: all assertions passed");
