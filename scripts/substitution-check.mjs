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


// ── round-5 regressions (real customer words) ───────────────────────────────
import { isLateArrivalReply } from "../src/lib/wa/fact-guard.ts";
import { detectJoinIntent } from "../src/lib/wa/join-intent.ts";

// "today" is a day. Not knowing that was the round-4 loop, still firing.
t('today resolves to a day', daysNamedIn("can i come today ?").length === 1);
t('tonight resolves',        daysNamedIn("is there a class tonight").length === 1);
t('tomorrow resolves',       daysNamedIn("what about tomorrow").length === 1);

// A day RANGE names no single day - this sent Monday's timetable on a Tuesday.
t('Mon-Sat is not Monday',  daysNamedIn("we run classes Mon-Sat").length === 0);
t('Mon to Sat is not Monday', daysNamedIn("classes run Mon to Sat evenings").length === 0);
t('range + real day keeps the real one',
  JSON.stringify(daysNamedIn("we run Mon-Sat, and Wednesday has an extra class")) === '["Wed"]');

// A correct late-arrival refusal must not be replaced by a timetable dump.
t('late reply exempted',
  isLateArrivalReply("8pm is more than 15 mins past the 7:30pm start, you won't be able to join tonight"));

// A clock time is not a promo price. This muted two real customers.
t('745 is not a price',  detectJoinIntent("oh so if i reach at 745 its ok ?") !== "quoted_promo_price");
t('645 is not a price',  detectJoinIntent("i'll reach 645 for the 630 class") !== "quoted_promo_price");
// Still guarded - it trips the OFFER_NOUN branch first, which is equally a
// handoff. What matters is that it is NOT let through.
t('252 still guarded',   detectJoinIntent("is the 252 offer still valid?") !== null);
t('bare 252 still guarded', detectJoinIntent("can i get it for 252") !== null);


// ── round-6 regressions ─────────────────────────────────────────────────────
import { forbiddenPhrases } from "../src/lib/wa/fact-guard.ts";

// The sheet forbids stating an age cutoff for the adult classes. The model did
// it twice, in unrelated conversations, so it is checked in code now.
t('"15 and up" caught',  forbiddenPhrases("Our All-Levels classes are open to everyone 15 and up").length === 1);
t('"(15+)" caught',      forbiddenPhrases("that puts you in our Adult group classes (15+)").length === 1);
t('"14+" caught',        forbiddenPhrases("teens 14+ can join").length === 1);
t('kids ages untouched', forbiddenPhrases("Our kids programme starts from age 3").length === 0);
t('prices untouched',    forbiddenPhrases("1 month is $280 and the drop-in is $42").length === 0);

// A rate the customer quotes with a unit is not a promo ask - this muted a
// whole PT enquiry and paused the chat.
t('100/session not a promo',
  detectJoinIntent("what's the difference between the assistant coach 80/session and senior coach 100/ session?") !== "quoted_promo_price");
t('80/session not a promo',
  detectJoinIntent("is PT 80/session?") !== "quoted_promo_price");
t('bare 252 still guarded (again)', detectJoinIntent("can i get it for 252") !== null);

console.log(fail === 0 ? "\nALL SUBSTITUTION CASES PASSED" : `\n${fail} FAILED`);
