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
// Anything else in an outbound reply is a promo figure JAI does not have —
// including a number the customer quoted at it (the $252 incident).
const ALLOWED_AMOUNTS = new Set([280, 250, 230, 200, 42, 35, 50, 60, 350, 0]);

// How a money amount can appear. A bare number is NOT money — that would bin
// ages (6, 10, 11, 14, 15), class sizes and class times. It only counts when a
// currency marker or a per-period suffix is glued to it, which is how the
// "$252" incident and its cousins ("252 dollars", "252 SGD", "252/mo") read.
const AMOUNT_PATTERNS: RegExp[] = [
  /\$\s?(\d[\d,]*(?:\.\d+)?)/g, //  $252 · $ 252 · $252.50
  /(\d[\d,]*(?:\.\d+)?)\s*(?:sgd|usd|dollars?|bucks)\b/g, //  252 dollars · 252 SGD
  /(?:sgd|usd|s\$|rm)\s*(\d[\d,]*(?:\.\d+)?)\b/g, //  SGD 252 · S$252
  /(\d[\d,]*(?:\.\d+)?)\s*(?:\/\s*(?:mo|mth|month)\b|per\s+(?:month|mth)\b|a\s+month\b)/g, //  252/mo · 252 per month
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
  const t = (text || "").toLowerCase();
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

function quotesUnknownBareAmount(text: string): boolean {
  const t = strippedForBareScan((text || "").toLowerCase());
  const m = t.match(/\b\d{3,4}\b/g);
  if (!m) return false;
  return m.some((s) => {
    const n = Number(s);
    if (ALLOWED_AMOUNTS.has(n)) return false;
    if (n >= 1900 && n <= 2099) return false; // a year, not a price
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
// preceded by a hyphen ("…-muay-thai-trial-class"). The adult slug is preceded by
// a slash ("/muay-thai-trial-class") or nothing (bare path). So we match the slug
// only when it is NOT preceded by a hyphen: fires on the adult link (with or
// without the domain) and the bare path, never on the "kids-…" forms.
const DEAD_ADULT_LINK = /(?<!-)\bmuay-thai-trial-class\b/;

/** True if the outbound text contains the switched-off ADULT trial Calendly link. */
export function hasDeadAdultLink(text: string): boolean {
  return DEAD_ADULT_LINK.test((text || "").toLowerCase());
}

// The reply JAI sends when the dead adult link is intercepted — the correct
// paused-adult + $42 drop-in answer, lifted from the model reply in jai-facts.ts
// (the "FREE TRIALS ARE PAUSED" section). NO Calendly link of any kind. Gives the
// customer the useful answer AND tells them Coach Jeremy will follow up (he is
// also paged on Telegram by the escalation).
export const PAUSED_ADULT_TRIAL_TEXT =
  "We've actually paused free trials for our Adult All-Levels classes at the moment, as the classes are running close to full. We're looking to bring them back around September, though that isn't fixed yet. In the meantime you can still come try us out with a drop-in class at $42 — same class, same coaches, beginners welcome 🙂 You can book it on our website here: https://jaimuaythai.com/booking\n\nI'm also getting Coach Jeremy to follow up with you personally 🙏";
