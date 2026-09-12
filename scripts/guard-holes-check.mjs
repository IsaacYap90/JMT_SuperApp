// The five holes /predeploy found on 11 Sep. Each assertion here FAILS on the
// code as it stood that night — that is the point of the file.
import { lateArrivalAnswer, buildDeterministicAnswer, isOfferAcceptance } from '../src/lib/wa/deterministic-answers.ts';
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
for (const t of ["Yes, 252 monthly is correct for our 3-month plan.", "monthly 252 is right", "it's 252 a mth", "monthly fee of 555", "the monthly rate is 999"]) {
  ok(JSON.stringify(t), hasDisallowedPrice(t) === true);
}
console.log("   control — rate-card figures and non-prices must still pass");
for (const t of [
  "Adults Unlimited is $280 for 1 month.",
  "It's $42 for the drop-in.",
  // These three were FALSE POSITIVES in the first version of the monthly
  // pattern: it bound any digit after "monthly", and a price hit replaces the
  // whole reply with the handoff and sets ai_paused. Same mechanism as the
  // 30 Jul class-size incident.
  "The monthly 3-month plan works out cheaper",
  "Our monthly 6 to 12 people class size stays small",
  "We have about 20 monthly members",
  "You get 12 classes a month",
]) {
  ok(JSON.stringify(t.slice(0, 34) + "…"), hasDisallowedPrice(t) === false);
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


console.log("6. the booking-offer gate must not hijack the turn");
{
  const OFFER = "You can come try a class first, no membership needed — want me to send you the booking link? 🥊";
  const g = (text, over = {}) =>
    isOfferAcceptance({
      lastAssistant: OFFER,
      text,
      joinHit: undefined,
      hasDeterministicAnswer: false,
      offerAgeMs: 60_000,
      ...over,
    });
  // The case this exists for.
  ok('"All right thank you!" still sends', g("All right thank you!") === true);
  ok('"ok" still sends', g("ok") === true);
  // Every way the first version got it wrong.
  ok("a buy signal does NOT", g("i want to sign up for the unlimited membership", { joinHit: "wants_to_join" }) === false);
  ok("a question does NOT", g("what time is the kids class on saturday?") === false);
  ok("something the schedule layer answers does NOT", g("monday timings", { hasDeterministicAnswer: true }) === false);
  ok("a long message does NOT", g("ok but can i bring my son he is 8 years old please") === false);
  ok("a stale offer does NOT", g("ok", { offerAgeMs: 21 * 24 * 60 * 60 * 1000 }) === false);
  ok("an unknown-age offer does NOT", g("ok", { offerAgeMs: null }) === false);
  ok("a refusal does NOT", g("no thanks") === false);
  // Pass 3: default-YES let 19 of 29 probed messages through. The message must
  // BE the acceptance now, so every one of these is rejected on its words alone.
  for (const t of [
    "can i bring my son",
    "can my 8 year old join",
    "is there a kids class",
    "my son is 8",
    "ya i want the membership",
    "ok book me in",
    "ok lets do it",
    "do you have parking",
    "where are you located",
    "i need to cancel my trial",
    "im injured, cant come",
    "please call me instead",
    "ok can you call me",
  ]) {
    ok(`rejects ${JSON.stringify(t)}`, g(t) === false);
  }
  // Pass 4: the emoji fallback was a UTF-16 surrogate class, so it matched ANY
  // emoji, and the Latin strip deleted CJK entirely — so a Chinese refusal with
  // a 🙏 on it was "accepted". These are the controls that were missing.
  for (const t of [
    "😂", "😭", "🤬", "💩",
    "不用了，谢谢 🙏",      // no need, thanks — a refusal
    "有儿童班吗 😊",        // is there a kids class
    "我要报名会员 😊",      // i want to sign up for membership
    "请打电话给我 🙏",      // please call me
    "我要取消 🙏",          // i want to cancel
    "多少钱？😊",           // how much
  ]) {
    ok(`rejects ${JSON.stringify(t)}`, g(t) === false);
  }
  // Real acceptances that the first default-NO version wrongly refused.
  for (const t of ["ok la", "ok lor", "okok", "oklah", "好", "可以", "好的", "要",
                   "please send the link", "yes send link", "ok bro", "sure boss", "好 👍"]) {
    ok(`sends ${JSON.stringify(t)}`, g(t) === true);
  }

  // …and the real acceptances still send.
  for (const t of ["All right thank you!", "ok", "okay thanks", "yes pls", "sure 👍", "ya send", "noted thanks", "👍"]) {
    ok(`sends ${JSON.stringify(t)}`, g(t) === true);
  }
  ok("no offer made does NOT", g("ok", { lastAssistant: "Anytime, Arthur 🙌" }) === false);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
