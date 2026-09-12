// The five holes /predeploy found on 11 Sep. Each assertion here FAILS on the
// code as it stood that night — that is the point of the file.
import { lateArrivalAnswer, buildDeterministicAnswer } from '../src/lib/wa/deterministic-answers.ts';
import { hasDisallowedPrice } from '../src/lib/wa/join-intent.ts';
import { checkDayBinding, indexSchedule } from '../src/lib/wa/fact-guard.ts';
import { JAI_FACTS } from '../src/lib/wa/jai-facts.ts';

const SCHED = indexSchedule(JAI_FACTS);

let fails = 0;
const ok = (name, cond, extra = "") => {
  if (cond) console.log(`  PASS  ${name}`);
  else { console.log(`  FAIL  ${name} ${extra}`); fails++; }
};

console.log("1. arriving EARLY must not be refused");
const CTX = ["the 7:30pm All-Levels class starts soon 🥊"];
for (const t of ["on my way, reach in 20 minutes", "coming now, be there in 20 mins", "arriving in 30 minutes"]) {
  const r = lateArrivalAnswer(t, undefined, CTX);
  ok(JSON.stringify(t), r === null || r.canJoin !== false, `-> ${JSON.stringify(r)}`);
}
console.log("   control — a real lateness must STILL be handled");
{
  const r = lateArrivalAnswer("i'll be 20 minutes late", undefined, CTX);
  ok("'20 minutes late' still answered", r !== null, `-> ${JSON.stringify(r)}`);
}

console.log("2. Saturday morning must show the adult class");
{
  const r = buildDeterministicAnswer("what time is the morning class on saturday", JAI_FACTS);
  const txt2 = (r && r.messageText) || "";
  ok("does not claim there are no morning classes", !/don't have any morning/i.test(txt2), `-> ${txt2}`);
  ok("Saturday's adult class is listed", /11[:.]30\s*(?:am)?\s*[–—-]\s*12/.test(txt2), `-> ${txt2}`);
}

console.log("3. a polite opener must not switch the timetable guard off");
for (const reply of [
  "No worries, our Kids class on Monday is 4:30-5:15pm",
  "Sorry, we don't run mornings on Tuesday — Tuesday classes start at 5:30pm.",
]) {
  const v = checkDayBinding(reply, SCHED);
  ok(JSON.stringify(reply.slice(0, 38) + "…"), Array.isArray(v) && v.length > 0, `-> ${JSON.stringify(v)}`);
}
console.log("   control — a TRUE negation must still be exempt");
{
  const v = checkDayBinding("We don't have a 4:30-5:15pm Kids class on Monday.", SCHED);
  ok("true negation still exempt", Array.isArray(v) && v.length === 0, `-> ${JSON.stringify(v)}`);
}

console.log("4. a bare figure with 'monthly' must not pass the price guard");
for (const t of ["Yes, 252 monthly is correct for our 3-month plan.", "monthly 252 is right", "it's 252 a mth"]) {
  ok(JSON.stringify(t), hasDisallowedPrice(t) === true);
}
console.log("   control — a real rate-card figure must still pass");
{
  ok("$280 (on the card) passes", hasDisallowedPrice("Adults Unlimited is $280 for 1 month.") === false);
}

console.log("5. a day-scoped gap must name the day");
{
  const r = buildDeterministicAnswer("what time is the evening class on sunday", JAI_FACTS);
  const txt = (r && r.messageText) || "";
  ok(
    "no unqualified 'no evening classes' claim",
    r === null || !/don't have any evening classes, sorry/i.test(txt),
    `-> ${txt}`
  );
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
