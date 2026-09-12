// Join / money intent guard for JAI (the JMT AI assistant).
//
// WHY (real incident 2026-07-29): a customer who had just done her trial wrote
// "I would like to take up the offer of $252 to try out one month first. How
// should I proceed". That offer was not in the fact sheet, so JAI GUESSED out
// loud — "I believe that's the 3-month rate at $250/month…" — and the customer
// ended up with three different prices in her head.
//
// Isaac's call: "Dont put 252 in the fact sheet. if trial or anyone say they
// want to join, ping jeremy right away. let him to handle." Then, on review:
// "why you deleted all price? its ok to tell them the membership like before
// tho. just not the trial special discount." Then, 2026-07-29 evening: "still
// quote the standard rate for adult class. dont go quiet on the lead, anything
// JAI unsure, always ping jeremy about it."
//
// So the line is drawn between TWO different things:
//   • A plain RATE question ("what are your rates?", "is there a signup fee?",
//     "how much is the adult monthly?") → JAI answers normally from the
//     standard rate card + rates page. No handoff, no pause, never silence.
//   • A real COMMITMENT to join/pay, or ANY promo / discount / special-offer /
//     trial-special ask, or a customer quoting a price that is not on the
//     standard card → Coach Jeremy, every time. JAI must never state, confirm,
//     deny, correct or estimate a promo figure.
//
// DEFENCE IN DEPTH — three layers, because the model is the thing that failed:
//   1. The fact sheet carries the standard rates but NO promo/discount figure
//      (jai-facts.ts).
//   2. The prompt tells the model to emit a JOIN_INTENT escalation and stop
//      selling (jai-reply.ts).
//   3. THIS FILE — deterministic code that runs regardless of what the model
//      does: detectJoinIntent() short-circuits the model entirely on a clear
//      buy/promo signal, and hasDisallowedPrice() scrubs any figure outside the
//      standard rate card that slipped into an outbound reply.

// The single line JAI sends on a join / promo signal. Same warm voice as the
// rest of the persona, one emoji, no price, no negotiation.
/**
 * Appended AFTER the answer on a join question — never sent on its own.
 *
 * The whole-message version below is now reserved for the case where the reply
 * itself is untrustworthy (a price outside the rate card), because binning bad
 * text is different from refusing to answer. Isaac, 2026-09-01, on the bare
 * handoff: "JAI should have handle it as it was... it was perfectly fine."
 */
/**
 * Does the CUSTOMER's message carry a 3-4 digit figure we cannot account for?
 *
 * `quotesUnknownBareAmount` deliberately exempts anything that looks like a
 * clock time, so "reach at 745" does not read as a promo. That exemption is
 * right for classification and wrong as a licence to ANSWER: 252 parses as
 * 2:52, and one ambient word like "class" or "today" is enough, so
 *
 *   "i want to join, my friend paid 252 monthly for the class"
 *
 * classified as wants_to_join, reached the model, and "yes, 252 is correct for
 * the 3-month plan" sailed past hasDisallowedPrice — which needs a currency
 * marker or /mo and has neither to work with. On the pre-2026-09-02 build every
 * phrasing of that was replaced wholesale by the handoff. Found by the
 * /predeploy code-review lane and reproduced against the real classifier.
 *
 * So the clock-time escape is granted only to figures that match a time we
 * actually teach. Everything else 3-4 digits that is not on the rate card means
 * hand it to Jeremy rather than answer around it.
 */
const CLASS_TIME_FIGURES = new Set([
  // Every real class, as a customer would type it without a colon: start, end,
  // and the +15 cut-off they are allowed to arrive by. Checked against the live
  // jai_facts timetable on 2026-09-02, because the first version of this set was
  // wrong in both directions — it carried 500, 900, 1200 and 1300, none of which
  // are class times and all of which are plausible promo figures, and it was
  // missing every Saturday time so a Saturday join question handed off.
  700, 715, 800,            // Mon/Wed/Fri 7:00-8:00am
  1215, 1230, 115,          // daily 12:15-1:15pm
  630, 645, 730,            // 6:30-7:30pm
  745, 830,                 // 7:30-8:30pm
  845, 930,                 // 8:30-9:30pm
  430, 445, 515,            // Tue/Thu Kids 4:30-5:15pm
  530, 600,                 // Tue/Thu Pre-Teen 5:15-6:00pm
  1000, 1015, 1045,         // Sat Kids 10:00-10:45am
  1100, 1130,               // Sat Pre-Teen 10:45-11:30am
  1145,                     // Sat All-Levels 11:30am-12:30pm
  // ── 24-hour forms ────────────────────────────────────────────────────────
  // 2026-09-07: a customer asked "adults can't book the kids session right?
  // the timing 1630 is just nice for me" and JAI handed off instead of
  // answering, because 1630 was not here — only its 12-hour twin 430 was. She
  // replied "Nvm maybe I try to join 1215 next time" and left.
  //
  // The previous pass added 1730/1830/2030 and called them "the same evenings",
  // which is exactly the shape of the miss: the afternoon and late-evening
  // classes never got theirs. Every class in the live jai_facts timetable is
  // now listed in BOTH forms — start, end and the +15 arrival cut-off — because
  // a customer copying a time off our own schedule must never trip the
  // unknown-figure guard.
  1315,                     // 12:15-1:15pm AL, end
  1630, 1645, 1715,         // Tue/Thu Kids 4:30-5:15pm
  1730, 1800,               // Tue/Thu Pre-Teen 5:15-6:00pm
  1830, 1845, 1930,         // 6:30-7:30pm AL
  1945, 2030,               // 7:30-8:30pm AL
  2045, 2130,               // 8:30-9:30pm Advanced / Fri Sparring
]);

/** How far after a figure we look for the word that makes it a time. */
const TIME_CUE_WINDOW = 14;
const TIME_CUE_RE =
  /\b(class|classes|session|sessions|slot|batch|morning|afternoon|evening|night|today|tomorrow|onwards|weekday|weekdays|weekend|mon|tue|tues|wed|thu|thur|thurs|fri|sat|saturday|sun|sunday|monday|tuesday|wednesday|thursday|friday|am|pm|come|reach|arrive|start|starts)\b/;

export function inboundHasUnknownFigure(text: string): boolean {
  // Strip 7+ digit runs first, exactly as quotesUnknownBareAmount does. Without
  // it "I want to join! whatsapp me at 9123 4567" tripped the gate, handed off
  // and set ai_paused — which nothing clears. The two functions are meant to
  // differ ONLY in the clock-time exemption.
  const t = strippedForBareScan((text || "").toLowerCase());
  // Some figures are BOTH a real class time and a plausible price — 600 is the
  // pre-teen class end and also "paid 600 monthly"; so are 800, 715, 530. The
  // deciding factor is not the number, it is what the customer is talking about.
  // If they are talking money, the class-time exemption does not apply: a
  // figure we cannot account for goes to Jeremy even if it happens to match the
  // timetable.
  const talkingMoney =
    /\b(paid|pay|paying|price|priced|pricing|cost|costs|charge|charges|monthly|months?|mths?|per\s*month|a\s*month|how\s*much|cheap|cheaper|budget|afford|membership|unlimited|promo|offer|deal|rate|rates|discount|package|plan|fee|fees|dollars?|bucks)\b|[$]/.test(t);

  const re = /\b(\d{3,4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    if (ALLOWED_AMOUNTS.has(n)) continue;                     // a price we publish
    if (n >= 1900 && n <= 2099 && !talkingMoney) continue;    // a year, not a price
    if (CLASS_TIME_FIGURES.has(n)) {
      // A class-time figure is exempt when it READS as a time. Deciding on
      // whether the message mentions money anywhere was too blunt: it handed
      // off "the 1130 class on saturday, how much monthly?", which is exactly
      // the lead we are told not to go quiet on. What separates the two is the
      // word sitting next to the number — "1130 class" vs "600 monthly".
      // ADJACENCY, deliberately, after trying proximity and reverting it.
      //
      // A window either side fixes the over-block ("the 1130 saturday class,
      // how much monthly?" is answered) but reopens a real leak: in "my friend
      // said 800 for 3 months, can i come to the 800 class?" the word "class"
      // falls inside the window of the asserted price, so the figure is
      // exempted and the model gets to confirm it. Ranking the nearest cue does
      // not settle it either — "600 class package right?" puts a time word
      // closer than the money word and is still a price.
      //
      // The honest discriminator is whether the customer is ASSERTING a figure
      // rather than asking, which is a classifier in its own right and not
      // something to bolt on at 2am. Adjacency errs toward the handoff, and a
      // handoff still pings Jeremy — the lead is slower, not lost. The known
      // cost: "the 1130 saturday class, how much monthly?" hands off because an
      // adjective sits between the number and the cue.
      const after = t.slice(m.index + m[1].length, m.index + m[1].length + TIME_CUE_WINDOW);
      // One connector may sit between the figure and the cue ("730 on weekdays",
      // "1130 this saturday") — without it those hand off, and they are plainly
      // times, not prices.
      const readsAsTime = new RegExp(
        `^\\s*(?:am|pm|h|hrs?)?\\s*(?:(?:on|at|in|this|next|every|for)\\s+)?${TIME_CUE_RE.source}`
      ).test(after);
      if (readsAsTime || !talkingMoney) continue;
    }
    return true;
  }
  return false;
}

export const JOIN_HANDOFF_SUFFIX =
  "I'm getting Coach Jeremy on this too — he'll confirm the details and get you set up 🙏";

export const JOIN_HANDOFF_TEXT =
  "Great — I'm getting Coach Jeremy on this now, he'll sort out the details with you 🙏";

// Unambiguous "I want to buy / how do I pay" phrasings. Every branch is
// first-person or imperative on purpose: a bare noun like "signup fee" or
// "membership" is a PRICE QUESTION, and JAI is allowed to answer those.
const COMMIT =
  /\b(?:take\s+up\s+(?:the\s+|that\s+|this\s+|your\s+|ur\s+)?(?:offer|deal|promo|package|plan|membership)|sign(?:ing)?\s+me\s+up|sign\s*me\s*up|(?:want|wanna|would\s+like|i'?d\s+like|keen|ready|wish|hoping)\s+to\s+(?:join|sign\s*up|register|enrol{1,2}(?:l)?|become\s+a\s+member|pay|make\s+payment|take\s+up)|interested\s+in\s+(?:joining|signing\s*up|registering|enrol)|how\s+(?:do|can|should|would|shall)\s+i\s+(?:proceed|pay|join|register|sign\s*up|make\s+payment|enrol)|how\s+(?:to|do\s+i)\s+(?:proceed|pay|join|sign\s*up|register)|how\s+much\s+(?:to|for)\s+join(?:ing)?|can\s+i\s+(?:register|sign\s*up|join|enrol)|register\s+online|sign\s*up\s+online|proceed\s+with)\b/;

// Promo / discount / special-offer asks. HARD trigger — never left to the model,
// because the model is the layer that guessed "$252" at a customer. Note what is
// deliberately NOT here: "trial rate" and "trial price" (the PT trial $50–60 is
// a fact JAI must state) and the bare verb "offer" ("what classes do you offer").
const PROMO =
  /\b(?:discount(?:s|ed|ing)?|promo(?:tion(?:al|s)?|s)?|voucher|coupon|rebate|special\s+(?:offer|price|rate|deal)|trial\s+(?:special|promo)|any\s+deals?|deal\s+(?:for|on)|cheaper|best\s+price|lower\s+price|price\s+match|first[-\s]?time(?:r)?\s+(?:rate|price|discount)|student\s+discount|corporate\s+rate)\b/;

// "the offer", "any offer", "the $252 offer", "is the offer still on" — the noun
// sense of "offer" only. At most a price token may sit between the determiner
// and the noun, so "the classes you offer" does not match.
const OFFER_NOUN =
  /(?:\b(?:the|this|that|any|your|ur|current|special|latest|new)\s+(?:\$?\s?\d[\d.,]*\s+)?offers?\b|\boffers?\s+still\b)/;

// Softer commitment verbs. Only the ones that mean BUY count, and only with
// money context. "looking to start training" is a warm opener, not a purchase —
// it must reach the model and get a real answer.
const SOFT_BUY =
  /\b(?:want|wanna|would\s+like|i'?d\s+like|keen|ready|looking|hoping)\s+(?:to\s+)?(?:take\s+up|buy|purchase|commit|go\s+ahead|pay\s+for|sign\s+on)\b/;

// Money / membership context. Deliberately excludes the bare verb "pay" — the
// drop-in path ("how do I pay for the class?") must stay self-serve.
const MONEY =
  /(?:\$\s?\d|\bmembership\b|\bpackage\b|\bplan\b|\bmonthly\b|\bunlimited\b|\boffer\b|\bpromo\b|\bdiscount\b|\bdeposit\b|\bpayment\b|\bprice\b|\bpricing\b|\brates?\b|\bfees?\b|\b\d\s*(?:month|mth|mo)s?\b)/;

// Booking/scheduling context — "can I sign up for the trial?" is a trial
// booking, not a membership purchase.
const CLASS_CTX =
  /(?:\b(?:class|classes|session|sessions|trial|schedule|slot|slots|timing|timings)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)/;

/**
 * Does this inbound message signal the customer wants to buy / join / pay, or
 * is asking about a promo JAI does not have?
 *
 * Returns a short intent label for the alert, or null. NULL IS THE NORMAL PATH:
 * a plain rate question returns null so JAI answers it from the rate card.
 */
export function detectJoinIntent(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (!t) return null;

  // Promo / discount / special-offer ask — always Jeremy's, no exceptions.
  if (PROMO.test(t) || OFFER_NOUN.test(t)) return "promo_ask";

  // The customer quoted a figure that is not on the standard rate card (the
  // "$252 offer"). JAI must not confirm, correct or explain it.
  if (disallowedAmounts(t).length > 0) return "quoted_promo_price";

  // …and the same figure with no currency marker at all ("is 252 still valid").
  // Inbound only — see quotesUnknownBareAmount().
  if (quotesUnknownBareAmount(t)) return "quoted_promo_price";

  const money = MONEY.test(t);
  if (COMMIT.test(t)) {
    // A booking-flavoured ask with no money in it is a trial/class question.
    if (CLASS_CTX.test(t) && !money) return null;
    return "wants_to_join";
  }
  if (SOFT_BUY.test(t) && money) return "wants_to_join";
  return null;
}

// The amounts JAI is allowed to say — exactly the ones on the standard rate
// card in jai-facts.ts (Isaac, 2026-07-29: "its ok to tell them the membership
// like before tho. just not the trial special discount."):
//   280 / 250 / 230  adults unlimited 1 / 3 / 6 month
//   250 / 230 / 200  under-21 unlimited 1 / 3 / 6 month
//   42               paid drop-in
//   35               10-class pack, per class
//   50 / 60          PT trial range
//   350              10-class pack total ($35 × 10)
//   0                "free" / "$0 for the trial" — trials are free, that is a fact
//   100 / 200        gear: "a decent starter pair of handwraps + gloves… about
//   40  (/ 60)       $100–200", "cheaper $40–60 options" — the GEAR PRICING line
//                    in jai-facts.ts (WHAT TO BRING). Added 2026-08-05: without
//                    them, a correct answer to "how much are gloves?" tripped
//                    hasDisallowedPrice, became a JOIN_INTENT, got REPLACED by
//                    the handoff line and set leads.ai_paused — i.e. JAI went
//                    silent on a live lead over a shopping question. Neither 100
//                    nor 40 is a plausible membership/promo figure (the card runs
//                    200–280 and the $252 class of incident sits there), which is
//                    what this guard exists to catch, so allowing them costs the
//                    money guard nothing.
// Anything else in an outbound reply is a promo figure JAI does not have —
// including a number the customer quoted at it (the $252 incident).
const ALLOWED_AMOUNTS = new Set([280, 250, 230, 200, 42, 35, 50, 60, 350, 0]);

// GEAR RANGES — the fact sheet's gear line quotes "$100–200" and "$40–60"
// (jai-facts.ts GEAR PRICING). Those must not trip the money guard, but putting
// 100 and 40 in ALLOWED_AMOUNTS was too blunt in BOTH directions:
//   - outbound, it un-guarded a bare "$40", and the real drop-in is $42 — a model
//     typo that used to be caught and escalated would have shipped to a customer;
//   - inbound, ALLOWED_AMOUNTS is shared with quotesUnknownBareAmount(), so "the
//     100 deal" stopped tripping the promo guard written after a live incident.
// So neutralise the RANGE as a phrase instead, and leave the bare numbers guarded.
// Only a low–high pair glued to a currency marker matches; "$40" alone does not.
// ⚠ The separator alternation is deliberately WIDE. A first pass matched only a
// bare dash and tested clean against the fact sheet's own two spellings — but the
// fact sheet is not what goes out. The prompt tells JAI to speak "casually,
// warmly", i.e. to PARAPHRASE, and "$100-$200" (dollar repeated) is one of the
// commonest ways a model renders a range. Every missed spelling trips the money
// guard, replaces a correct gear answer with the handoff line and sets
// ai_paused — JAI silent on a lead who asked what gloves cost, which is the very
// incident this whole block exists to prevent. Nemotron entering the chain makes
// divergent phrasing MORE likely, not less.
// It still cannot leak: the stripped span must literally be 100→200 or 40→60, so
// no other figure can occupy it ("$100 and $252 and $200" → 252 still caught).
const GEAR_RANGES =
  /(?:\$\s?)?\b(?:100\s*(?:[-–—]|to|and|up\s+to)\s*(?:\$\s?)?200|40\s*(?:[-–—]|to|and|up\s+to)\s*(?:\$\s?)?60)\b/g;

// How a money amount can appear. A bare number is NOT money — that would bin
// ages (6, 10, 11, 14, 15), class sizes and class times. It only counts when a
// currency marker or a per-period suffix is glued to it, which is how the
// "$252" incident and its cousins ("252 dollars", "252 SGD", "252/mo") read.
const AMOUNT_PATTERNS: RegExp[] = [
  /\$\s?(\d[\d,]*(?:\.\d+)?)/g, //  $252 · $ 252 · $252.50
  /(\d[\d,]*(?:\.\d+)?)\s*(?:sgd|usd|dollars?|bucks)\b/g, //  252 dollars · 252 SGD
  /(?:sgd|usd|s\$|rm)\s*(\d[\d,]*(?:\.\d+)?)\b/g, //  SGD 252 · S$252
  // 🛑 "monthly" was missing until 12 Sep 2026, so "252 monthly is correct for
  // our 3-month plan" shipped straight past this guard — the 29 Jul $252
  // incident again, just without the dollar sign. Same for "a mth" and the
  // "x months" phrasing people actually type.
  /(\d[\d,]*(?:\.\d+)?)\s*(?:\/\s*(?:mo|mth|month)\b|per\s+(?:month|mth|mo)\b|a\s+(?:month|mth)\b|monthly\b(?!\s*(?:member|people|person|pax|student|kid|class|session)s?\b)|\s*(?:\/|per\s+)?(?:pax|person)\s+(?:a|per)\s+month\b)/g, //  252/mo · 252 per month · 252 monthly
  // The figure can also come BEFORE the word: "monthly 252", "monthly is 280".
  // 🛑 Three digits minimum, and not immediately followed by a unit word. The
  // first version bound any digit after "monthly", so "the monthly 3-month
  // plan", "monthly 6 to 12 people class size" and "about 20 monthly members"
  // all read as prices — and a price hit REPLACES the reply with the handoff
  // and sets ai_paused. That is the 30 Jul class-size incident's mechanism.
  // Anything under 100 without a currency marker is caught by the $ pattern
  // above if it really is money. (Tightened 12 Sep 2026.)
  // A head-count puts the number FIRST ("20 monthly members"), which pattern 1
  // above handles and excludes. After the word, a 3-digit figure next to
  // "monthly" is money often enough that handing off is the safer error — so
  // member/people/student are NOT excluded here, only the units that make a
  // figure structurally not-a-price ("monthly 3-month plan").
  // 🛑 The unit words need `s?\b`. Without it the lookahead matched the PREFIX
  // of a longer word, so "our monthly 400 membership plan" — the exact shape of
  // a model-invented price — leaked straight through a guard that used to block
  // it. Pattern 1 above always had it; this one did not. (Same day.)
  /\bmonthly\b(?:\s+(?:is|at|of|rate|fee|price|cost|costs|comes|to)){0,4}\s*(\d{3}[\d,]*(?:\.\d+)?)\b(?!\s*(?:-|–)?\s*(?:month|mth|class(?:es)?|session|year)s?\b)/g,
];

// NOTE (fixed 2026-07-30): "per class / per session / per pax" used to count as a
// money suffix. It binned a plain class-SIZE answer — "capped at 10 per class" —
// which then became a JOIN_INTENT, replaced the correct reply with the handoff
// line AND set leads.ai_paused, i.e. JAI went silent on a parent asking how many
// kids are in a class. Exactly what Isaac forbade ("dont go quiet on the lead").
// Real money-per-class is still caught: "$35 per class" / "$99 per class" carry a
// currency marker and match the first pattern independently.

// NOTE: this checks amounts only, deliberately. A blanket "N% off" block was
// tried and rejected — the fact sheet legitimately describes the PT trial as
// "about 50% off a normal session", so the guard would bin correct PT replies.
// The trial-special percentage is kept out of JAI's mouth by removing it from
// the fact sheet, not here.

/** Every money amount in the text that is NOT on the standard rate card. */
export function disallowedAmounts(text: string): number[] {
  // Strip the fact sheet's gear RANGES first so their endpoints are never scanned
  // as standalone prices. Outbound only — quotesUnknownBareAmount() deliberately
  // does NOT do this, so a customer quoting "the 100 deal" still trips inbound.
  const t = (text || "").toLowerCase().replace(GEAR_RANGES, " ");
  const out: number[] = [];
  for (const re of AMOUNT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const n = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(n) && !ALLOWED_AMOUNTS.has(n)) out.push(n);
    }
  }
  return out;
}

// INBOUND ONLY. The 2026-07-29 incident in its purest form: the customer writes
// a promo figure with no currency marker at all — "is 252 still valid", "my
// friend said 252", "252 ah?" — and none of the AMOUNT_PATTERNS see it, so it
// reaches the model, which then confirms it in words with no digits ("yes,
// that rate is still valid") and slips straight past the outbound guard too.
// A bare 3–4 digit integer that is not on the standard rate card is therefore
// treated as a quoted promo price and handed to Jeremy.
//
// Safe inbound because everything a customer legitimately types in this chat is
// under 100 (ages 6–15, class caps of 10, "7pm", "6.30pm") or longer than 4
// digits (SG postcodes are 6, mobile numbers 8). Two exceptions are stripped
// first, both verified against real customer phrasing:
//   • phone numbers written in groups — "+65 9123 4567" → two 4-digit runs;
//     any digit run totalling 7+ digits is removed before the check.
//   • years 1900–2099 — "I trained back in 2019".
// NOT applied outbound: JAI legitimately writes bare numbers (class sizes,
// times, ages), and outbound is already covered by the currency patterns.
function strippedForBareScan(t: string): string {
  return t.replace(/\d[\d\s-]*\d/g, (run) =>
    (run.match(/\d/g) || []).length >= 7 ? " " : run,
  );
}

// A bare 3-4 digit number is USUALLY a price here. It is not when the customer
// is telling us a clock time, and Singaporeans write those without a colon:
// "oh so if i reach at 745 its ok ?" — Kenneth, 31 Aug, a real customer whose
// real question never reached the model because 745 read as a promo figure. JAI
// handed him to Coach Jeremy and muted itself. Same for "645 for the 630 class".
// So: if it parses as HH:MM and the sentence is about arriving or being late,
// it is a time, not an offer.
const ARRIVAL_CTX =
  /\b(reach|reaching|arrive|arriving|arrival|late|later|come|coming|get\s+there|be\s+there|start|starts|class|by|before|after|tonight|today|tomorrow)\b/i;

function looksLikeClockTime(n: number, t: string): boolean {
  if (n < 100 || n > 2359) return false;
  const mins = n % 100;
  const hrs = Math.floor(n / 100);
  if (mins > 59 || hrs > 23) return false;
  return ARRIVAL_CTX.test(t);
}

function quotesUnknownBareAmount(text: string): boolean {
  const t = strippedForBareScan((text || "").toLowerCase());
  const m = t.match(/\b\d{3,4}\b/g);
  if (!m) return false;
  return m.some((s) => {
    const n = Number(s);
    if (ALLOWED_AMOUNTS.has(n)) return false;
    if (n >= 1900 && n <= 2099) return false; // a year, not a price
    if (looksLikeClockTime(n, t)) return false; // "reach at 745" is a time
    // A rate the customer attaches to a unit is them QUOTING our own pricing
    // back at us, not asking after a promo. "what's the difference between the
    // assistant coach 80/session and senior coach 100/session" muted the whole
    // PT enquiry: JAI sent the handoff line and paused the chat, and the
    // timings half of the question was never answered. PT still routes to
    // Jeremy through the PT rules; it just should not silence JAI.
    if (new RegExp(`\\b${n}\\s*(?:/|per\\s+)\\s*(?:session|class|pax|person|head|hour|hr)\\b`).test(t)) {
      return false;
    }
    return true;
  });
}

/** True if the outbound text contains a money amount JAI must not state. */
export function hasDisallowedPrice(text: string): boolean {
  return disallowedAmounts(text).length > 0;
}

// ── Dead adult-trial-link guard ──────────────────────────────────────────────
// WHY (real incident 2026-08-01): a female adult beginner ("nss") asked "how to
// book trial". jai-facts.ts / jai-reply.ts both say plainly that adult free
// trials are PAUSED, the adult Calendly link is SWITCHED OFF, and the model must
// NEVER send it — offer the $42 drop-in instead. DeepSeek ignored all of that and
// sent https://calendly.com/jaimuaythaisg/muay-thai-trial-class anyway; she got
// "unable to access". SAME failure class as the 2026-07-29 "$252" promo incident:
// you cannot trust the model to obey "never send X". So, exactly like the money
// guard above, this is the deterministic OUTBOUND backstop.
//
// PRECISION IS CRITICAL. The DEAD adult slug is  jaimuaythaisg/muay-thai-trial-class.
// The two KIDS/PRE-TEEN slugs are still LIVE and MUST pass untouched:
//   jaimuaythaisg/kids-muay-thai-trial-class           (Kids 6–10)
//   jaimuaythaisg/kids-pre-teen-muay-thai-trial-class  (Pre-Teen 11–14)
// Both kids slugs CONTAIN "muay-thai-trial-class" as a substring — but always
// preceded by a hyphen ("…-muay-thai-trial-class"). The adult slug only ever
// appears after a SLASH — both in the full link and in the bare
// "/muay-thai-trial-class" path — because this guard exists to catch a SENDABLE
// LINK, and a link has a slash in it.
//
// So we anchor on that slash rather than merely excluding the hyphen. The old
// /(?<!-)\bmuay-thai-trial-class\b/ rejected the kids slugs correctly but ALSO
// fired on prose — "the kids muay-thai-trial-class", "Muay-Thai-Trial-Class" —
// where a SPACE precedes it. Cost of that false positive (fixed 2026-08-05): a
// parent of a 6–14 year old gets outText replaced by PAUSED_ADULT_TRIAL_TEXT,
// which is the ADULT answer that jai-reply.ts explicitly forbids sending to
// them ("NEVER tell a parent of a 6–14 year old that trials are paused").
// A start-of-string alternative was deliberately NOT added: it re-opens exactly
// that false positive for a message that OPENS with the prose form, and the only
// thing it would additionally catch is a slash-less bare slug, which is not a
// link and cannot be tapped.
const DEAD_ADULT_LINK = /\/muay-thai-trial-class\b/;

/** True if the outbound text contains the switched-off ADULT trial Calendly link. */
export function hasDeadAdultLink(text: string): boolean {
  return DEAD_ADULT_LINK.test((text || "").toLowerCase());
}

// The reply JAI sends when the dead adult link is intercepted — the correct
// paused-adult + $42 drop-in answer, lifted from the model reply in jai-facts.ts
// (the "FREE TRIALS ARE PAUSED" section). NO Calendly link of any kind. Gives the
// customer the useful answer AND tells them Coach Jeremy will follow up (he is
// also paged on Telegram by the escalation).
// 🛑 NO MONTH, NO DATE, NO SEASON, and no promise to notify them. This string is
// assigned straight to outText on both WhatsApp and Instagram, so no model and no
// fact guard ever sees it. Until 12 Sep 2026 it told every adult asking about a
// free trial that they return "around September" — still going out ON
// 12 September, while the fact sheet two files away already forbade naming a
// month ("reads as either a lie or a bot that cannot tell the date", Isaac
// 2026-09-01). Coach Jeremy has not decided a date. Wording follows the sheet's
// approved model reply; scripts/facts-fallback-check.mjs now fails if a month
// reappears here.
// The anti-loop handoff, and the line the fact guard sends when it blocks a
// draft. Both used to be inline strings — ANTI_LOOP_HANDOFF_TEXT in the webhook
// route, the guard line in jai-reply.ts. They live here with the other
// customer-facing handoff copy because the lead-followup cron has to recognise
// them: it excluded only the JOIN handoff, so a thread that had just been
// escalated for a complaint, a PT enquiry, an anti-loop trip or a blocked fact
// got a cheerful "just checking that answered what you needed?" nudge an hour
// later, on top of the escalation, while the lead sat waiting for Jeremy.
// (Found 12 Sep 2026.)
export const ANTI_LOOP_HANDOFF_TEXT =
  "Let me get Coach Jeremy to sort this out for you directly 🙏 He'll reach out to you shortly.";

export const FACT_GUARD_BLOCK_TEXT =
  "Good question — let me double-check that with Coach Jeremy and get right back to you 🙏";

export const PAUSED_ADULT_TRIAL_TEXT =
  "We've actually paused free trials for our Adult All-Levels classes at the moment, as the classes are running close to full. What you can do straight away is a one-off drop-in at $42 — same class, same coaches, beginners welcome 🙂 You can book it on our website here: https://jaimuaythai.com/booking\n\nI'm also getting Coach Jeremy to follow up with you personally 🙏";

// Every bot line that means "a human is taking this over". A thread whose last
// bot turn was one of these must NOT be armed for a silent nudge: the lead is
// waiting for Jeremy, not for us. Only the JOIN handoff was excluded before, so
// a complaint, a PT enquiry, an anti-loop trip, a blocked fact and the paused
// adult-trial reply all got nudged an hour later with "just checking that
// answered what you needed? 🙂" — on top of the escalation. (Found 12 Sep 2026.)
// PAUSED_ADULT_TRIAL_TEXT is matched on its stable opening clause so that
// editing the drop-in wording cannot silently re-arm the nudge.
export const HANDOFF_MARKERS = [
  JOIN_HANDOFF_TEXT,
  JOIN_HANDOFF_SUFFIX,
  ANTI_LOOP_HANDOFF_TEXT,
  FACT_GUARD_BLOCK_TEXT,
  PAUSED_ADULT_TRIAL_TEXT.slice(0, 80),
];
