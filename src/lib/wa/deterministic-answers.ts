// LAYER 2 — deterministic answers for the two highest-risk question types.
//
// WHY: the fact sheet goes to DeepSeek and the model paraphrases it. Twice it
// invented class times ("7:00-8:00pm" when the real evening classes are
// 6:30-7:30pm and 7:30-8:30pm) despite an explicit rule forbidding exactly
// that. Class times and prices are (a) the two things that cost the business
// money when they're wrong and (b) the two things that are a pure lookup. So
// they don't go through the model at all — we parse them out of the fact sheet
// and compose the reply in code.
//
// Same idea, same shape as the hardcoded "Done" booking verification in
// src/app/api/whatsapp/webhook/route.ts (see src/lib/wa/trial-verify.ts):
// pure functions here, the intercept + send lives in the webhook handler.
//
// THE FACT SHEET STAYS THE SOURCE OF TRUTH. Nothing here hardcodes a time or a
// price — every number in an outgoing message is text lifted out of the sheet.
// The owner can still edit the sheet (or, once it moves to the DB, the DB row)
// without a deploy. If a sheet edit breaks our parse we return null and the
// caller falls through to the AI: never a wrong or empty message.
//
// MULTI-TENANT: no gym-specific knowledge lives in the logic. Every keyword,
// day name, alias and copy template is in DEFAULT_CONFIG below, which another
// tenant can replace wholesale (buildDeterministicAnswer takes a config).

import { detectLang, type Lang } from "./lang";

// ── Tenant config ────────────────────────────────────────────────────────────

export type TimeWindow = { aliases: string[]; fromHour: number; toHour: number };

export type DeterministicConfig = {
  /** IANA zone used to resolve "today" / "tonight" / "tomorrow". */
  timeZone: string;
  /** Headers we look for inside the fact sheet (matched case-insensitively). */
  scheduleSectionMatch: string;
  pricingSectionMatch: string;
  /** Words that make us confident it's a schedule question (score 2 / 1). */
  scheduleStrong: string[];
  scheduleWeak: string[];
  /** Words that make us confident it's a price question (score 2 / 1). */
  priceStrong: string[];
  priceWeak: string[];
  /** Only worth a point when some other signal already fired ("morning *class*"). */
  classWords: string[];
  /** Any of these present → always the AI's job. See intentOf() for the reasoning. */
  fallThrough: string[];
  /** Another subject in the same message → compound question → AI. */
  otherTopics: string[];
  /** Picks the youth/junior price tier out of the sheet's tier list. */
  youthWords: string[];
  /** A price line whose label matches this is a casual/drop-in rate, not a tier. */
  dropInLabel: RegExp;
  /** Day label in the sheet → the ways a customer might write it. */
  dayAliases: Record<string, string[]>;
  todayWords: string[];
  tomorrowWords: string[];
  timeWindows: Record<string, TimeWindow>;
  /** Guards — anything longer / more compound than this goes to the AI. */
  maxWords: number;
  maxChars: number;
  /** Score needed to intercept. 2 = one unambiguous phrase, or two weak hints. */
  threshold: number;
  copy: DeterministicCopy;
  /**
   * Chinese overrides, merged over `copy` when the customer writes Chinese.
   * Partial on purpose: a tenant supplies only the lines it has translated and
   * every other line keeps its English wording, so an untranslated key degrades
   * to today's behaviour instead of to an empty message. Omit it entirely and
   * nothing changes at all. See configForLang().
   */
  copyZh?: Partial<DeterministicCopy>;
};

export type DeterministicCopy = {
  scheduleDayIntro: string; // {day}
  scheduleWindowIntro: string; // {window}
  scheduleNoDayAsk: string; // {days}
  scheduleNothingInWindow: string; // {window}
  scheduleNothingOnDay: string; // {window}, {day}
  scheduleTrailer: string;
  lateOk: string;
  lateTooLate: string;
  priceIntro: string; // {tier} {price}
  priceTrailer: string;
  /** Trailer for the youth tiers — must never contain BOOKING_OFFER_MARKER. */
  priceTrailerYouth: string;
  quickReplies: { schedule: string[]; price: string[] };
};

export const DEFAULT_CONFIG: DeterministicConfig = {
  timeZone: "Asia/Singapore",
  scheduleSectionMatch: "CLASS SCHEDULE",
  pricingSectionMatch: "PRICING",

  scheduleStrong: [
    "what time", "wat time", "what times", "whattime", "timetable", "time table",
    "schedule", "class times", "class time", "opening hours", "jadual", "jadual kelas",
    "几点", "課程表", "课程表", "时间表", "時間表", "上课时间",
  ],
  scheduleWeak: [
    "when", "bila", "hours", "times", "什么时候", "什麼時候",
    "morning", "afternoon", "evening", "night", "tonight", "lunch", "weekend",
    "pagi", "petang", "malam", "早上", "晚上", "下午",
  ],

  priceStrong: [
    "how much", "howmuch", "price", "prices", "pricing", "fee", "fees",
    "cost", "costs", "how much is it", "berapa", "harga", "yuran",
    "多少钱", "多少錢", "价格", "價格", "收费", "收費", "学费", "學費",
  ],
  priceWeak: [
    "rate", "rates", "monthly", "per month", "a month", "sebulan", "月费", "月費",
  ],

  classWords: ["class", "classes", "training", "train", "session", "sessions", "kelas", "membership", "课", "課", "班"],

  // These always go to the AI. Each one is a rule the model handles with
  // nuance that a canned answer would get wrong:
  //  • trial / calendly / booking — Calendly is the ONLY source of trial
  //    availability; quoting a class time as a trial slot is the exact mistake
  //    the fact sheet calls out.
  //  • drop-in — only offered after checking experience.
  //  • PT — Jeremy's, escalates.
  //  • member admin (freeze / renew / billing / cancel) — escalates.
  //  • discount / corporate / promo — escalates.
  fallThrough: [
    "trial", "free class", "percubaan", "试课", "試課", "体验课", "體驗課",
    "book", "booking", "reschedule", "calendly", "slot", "sign up", "signup", "register",
    "drop in", "drop-in", "dropin", "one class only", "single class",
    "pt", "personal training", "private", "1-1", "one to one", "1 to 1",
    "freeze", "pause", "renew", "renewal", "billing", "invoice", "refund", "cancel",
    "glofox", "my membership", "discount", "promo", "voucher", "corporate", "company",
  ],

  // A second subject in the same message → compound → the AI answers it whole.
  otherTopics: [
    "where", "address", "location", "map", "mrt", "parking", "how to get",
    "bring", "wear", "glove", "gloves", "wrap", "shin", "equipment",
    "age", "old", "beginner", "beginners", "experience", "coach", "coaches",
    "late", "injury", "injured", "shower", "toilet", "carpark",
  ],

  youthWords: [
    "kid", "kids", "child", "children", "son", "daughter", "teen", "teens",
    "pre-teen", "preteen", "student", "students", "nsf", "under 21",
    // Malay. "anak" alone was not enough: a parent writing "budak" got the
    // ADULT price quoted as fact (found 12 Sep 2026). The sheet's own rule is
    // "Malay in, Malay out", so these are ordinary inputs here.
    "anak", "budak", "kanak", "kanak-kanak", "remaja", "pelajar",
    "小孩", "孩子", "儿童", "兒童", "学生", "學生",
  ],
  dropInLabel: /drop[- ]?in|casual|single/i,

  dayAliases: {
    Mon: ["mon", "monday", "isnin", "星期一", "周一", "週一", "礼拜一"],
    Tue: ["tue", "tues", "tuesday", "selasa", "星期二", "周二", "週二", "礼拜二"],
    Wed: ["wed", "weds", "wednesday", "rabu", "星期三", "周三", "週三", "礼拜三"],
    Thu: ["thu", "thur", "thurs", "thursday", "khamis", "星期四", "周四", "週四", "礼拜四"],
    Fri: ["fri", "friday", "jumaat", "星期五", "周五", "週五", "礼拜五"],
    Sat: ["sat", "saturday", "sabtu", "星期六", "周六", "週六", "礼拜六"],
    Sun: ["sun", "sunday", "ahad", "星期日", "星期天", "周日", "週日", "礼拜天"],
  },
  todayWords: ["today", "tonight", "hari ini", "今天", "今晚"],
  tomorrowWords: ["tomorrow", "tmr", "tmrw", "esok", "明天", "明晚"],

  timeWindows: {
    // 🛑 toHour is EXCLUSIVE. At 11 this hid Sat 11:30am-12:30pm All-Levels —
    // Saturday's ONLY adult class — so an adult asking about Saturday morning
    // was shown Kids and Pre-Teen and told nothing else existed. (11 Sep 2026.)
    morning: { aliases: ["morning", "am class", "pagi", "早上", "早班"], fromHour: 0, toHour: 12 },
    afternoon: { aliases: ["afternoon", "lunch", "lunchtime", "noon", "petang", "下午", "中午"], fromHour: 12, toHour: 17 },
    evening: { aliases: ["evening", "night", "tonight", "after work", "malam", "晚上", "晚班", "今晚"], fromHour: 17, toHour: 24 },
  },

  maxWords: 20,
  maxChars: 160,
  threshold: 2,

  copy: {
    scheduleDayIntro: "*{day}* classes:",
    scheduleWindowIntro: "Our *{window}* classes:",
    scheduleNoDayAsk:
      "Sure! We run classes {days} 🥊 Which day are you looking at? Tell me the day and I'll give you the exact times.",
    scheduleNothingInWindow: "We don't have any {window} classes, sorry!",
    // Day-scoped version. Without it, "evening class on sunday" answered "We
    // don't have any evening classes, sorry!" — false for Mon-Fri. (11 Sep 2026.)
    scheduleNothingOnDay: "We don't have any {window} classes on *{day}*, sorry!",
    scheduleTrailer: "Anything else I can help with? 🙂",
    lateOk:
      "No worries — {mins} minutes is inside our 15-minute window, so you're still good to join 🙏 Just come straight in.",
    lateTooLate:
      "Thanks for letting us know 🙏 We hold a hard {cutoff}-minute cut-off, so unfortunately you won't be able to join that class. Happy to get you booked on another day — which day suits you?",
    priceIntro: "*{tier}*\n{price}",
    // NOT "everyone gets a free trial". Adult free trials are PAUSED — the fact
    // sheet's hardest rule is "NEVER OFFER AN ADULT A TRIAL. IN ANY CONTEXT",
    // and this canned line was offering one to every adult who asked a price,
    // unguarded, because it never passes through the model. The paid drop-in is
    // the invitation now. (Kids and Pre-Teen trials still run, but this trailer
    // fires on adult pricing.)
    priceTrailer:
      // No second figure here: the sheet says give the starting price and the
      // rates link, not the whole list, and the suite checks that the drop-in
      // rate does not leak into a membership answer.
      "You can come try a class first, no membership needed — want me to send you the booking link? 🥊",
      // 🛑 Keep this wording in step with BOOKING_OFFER_MARKER above — the
      // acceptance handler matches on it.
    // 🛑 The youth tiers get their OWN trailer, carrying NO booking offer.
    // priceTrailer was appended to every tier, so a parent asking a kids price
    // was offered the booking link; they replied "ok", isOfferAcceptance fired
    // on BOOKING_OFFER_MARKER and the ADULT $42 drop-in branch answered a
    // question about a 7-year-old. Kids (6-10) and Pre-Teen (11-14) free
    // trials are still running and are booked on Calendly, so the drop-in is
    // the wrong path for them entirely. This line must NOT contain
    // BOOKING_OFFER_MARKER. (Found 12 Sep 2026.)
    priceTrailerYouth:
      "Happy to help you get them started — how old are they? 🙂",
    quickReplies: {
      schedule: ["Today", "Tomorrow"],
      price: ["Book a class"],
    },
  },

  // ── Chinese ───────────────────────────────────────────────────────────────
  // Every line the customer can see, in Chinese. Nothing else about the layer
  // changes: the same parse, the same fact sheet, the same numbers.
  //
  // Day and window names stay English inside these sentences ("*Monday* 的课",
  // "我们 *morning* 的课") because they are lifted verbatim from the fact sheet
  // and are the gym's own labels. That mix is also how JAI already writes to
  // Chinese leads through the model — "Weekday 的 All Levels 课时间" is its own
  // wording from the 15 Sep thread — so it reads native rather than translated.
  copyZh: {
    scheduleDayIntro: "*{day}* 的课：",
    scheduleWindowIntro: "我们 *{window}* 的课：",
    scheduleNoDayAsk:
      "我们 {days} 都有课 🥊 你想看哪一天？告诉我哪天，我把确切的时间发给你。",
    scheduleNothingInWindow: "我们没有 {window} 的课，不好意思！",
    scheduleNothingOnDay: "*{day}* 没有 {window} 的课，不好意思！",
    scheduleTrailer: "还有什么我可以帮你的吗？🙂",
    lateOk:
      "没问题 — {mins} 分钟还在我们 15 分钟的宽限时间内，你还是可以上的 🙏 直接进来就好。",
    lateTooLate:
      "谢谢你先告诉我们 🙏 我们有 {cutoff} 分钟的硬性截止时间，所以这一堂恐怕赶不上了。很乐意帮你安排另一天 — 你哪天方便？",
    priceIntro: "*{tier}*\n{price}",
    // 🛑 Must contain BOOKING_OFFER_MARKER_ZH — hasBookingOffer() matches on it
    // to recognise her reply as accepting the link. Keep the two in step, the
    // same way the English trailer tracks BOOKING_OFFER_MARKER.
    priceTrailer: "你可以先来上一堂看看，不需要先买配套 — 要我把预约链接发给你吗？🥊",
    // 🛑 As with the English one, this must NOT carry the booking marker.
    priceTrailerYouth: "很乐意帮他开始 — 请问小朋友几岁呢？🙂",
    quickReplies: {
      schedule: ["今天", "明天"],
      price: ["预约上课"],
    },
  },
};

// ── The booking-link offer, and hearing the answer ──────────────────────────
// The adult price answer ends with "want me to send you the booking link?".
// That is a direct question, and until 12 Sep 2026 NOTHING read the reply:
// Arthur answered "All right thank you!" and got "Anytime, Arthur" back
// instead of the link. JAI was asking a question it could not hear.
//
// The asymmetry decides the rule: sending a booking link to someone who did
// not want it costs nothing; not sending it loses the lead. So anything that
// is not clearly a refusal counts as yes.
export const BOOKING_OFFER_MARKER = "want me to send you the booking link";

// The Chinese trailer says the same thing, so the same acceptance handling has
// to fire for it. Without this the offer would go out in Chinese and her "好"
// would be heard by nothing — the offer JAI could not hear, again, in the other
// language. Match on the question itself, not the whole sentence.
export const BOOKING_OFFER_MARKER_ZH = "要我把预约链接发给你吗";

/**
 * Did our last message offer the booking link, in either language?
 *
 * 🛑 Use this instead of `lastAssistant.includes(BOOKING_OFFER_MARKER)`. A bare
 * English-only test silently fails every Chinese thread.
 */
export function hasBookingOffer(lastAssistant: string): boolean {
  const s = lastAssistant || "";
  return s.includes(BOOKING_OFFER_MARKER) || s.includes(BOOKING_OFFER_MARKER_ZH);
}

/**
 * The same config with its customer-facing copy switched to `lang`.
 *
 * Returns the config UNCHANGED for "en", and unchanged for any tenant that has
 * not supplied `copyZh` — so this is inert until a tenant opts in, and an
 * untranslated key falls back to English rather than to nothing.
 */
export function configForLang(
  cfg: DeterministicConfig,
  lang: Lang
): DeterministicConfig {
  if (lang !== "zh" || !cfg.copyZh) return cfg;
  return {
    ...cfg,
    copy: {
      ...cfg.copy,
      ...cfg.copyZh,
      quickReplies: cfg.copyZh.quickReplies ?? cfg.copy.quickReplies,
    },
  };
}

// Only these turn the offer down. Everything else — "ok", "sure", "all right
// thank you", "yes pls", a thumbs-up, even silence-shaped politeness — is a yes.
const DECLINE_RE =
  /\b(no thanks|no thank you|no need|not now|not yet|nope|nah|maybe later|later lah|i'?m good|im good|all good|don'?t need|dont need|no lah|not interested)\b/i;

/** True when the customer's reply to the booking-link offer is not a refusal. */
export function acceptsBookingOffer(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (DECLINE_RE.test(t)) return false;
  // A bare "no" on its own, but not "no worries" or "no problem".
  if (/^no[.!\s]*$/i.test(t)) return false;
  return true;
}

// 🛑 DEFAULT-NO, deliberately, and this is the second correction to it.
// "Anything that is not a refusal" is the right asymmetry for the MODEL path —
// an unwanted link costs nothing. It is the wrong one for a branch that also
// suppresses the join handling and the deterministic answer, because there the
// link REPLACES the correct reply. Under default-yes, 19 of 29 probed messages
// got an adult $42 pitch: "can i bring my son" (a parent, about an 8-year-old),
// "ya i want the membership" (a buy signal the join regex misses, so Jeremy was
// never pinged), "im injured, cant come", "please call me instead".
//
// So the message must be acceptance and NOTHING else: every word in it has to
// be an affirmation or a pleasantry. "All right thank you!" passes. "ya i want
// the membership" does not — "membership" is not on this list.
const ACCEPT_WORD =
  /^(?:yes|yeah|yea|yah|ya|yup|yep|ok|oki|okie|okay|okok|oklah|k|kk|sure|alright|right|all|please|pls|plz|send|it|the|link|me|my|go|ahead|thanks|thank|you|thx|tks|ty|noted|good|great|nice|cool|perfect|awesome|sounds|lah|la|lor|loh|leh|hor|sia|can|boleh|bro|boss|bos|sir|maam)$/i;

// The commonest Chinese yes. Checked whole-message, because the Latin strip
// below deletes CJK entirely — which is how "有儿童班吗 😊" (is there a kids
// class) once counted as an acceptance.
const CJK_ACCEPT = new Set(["好", "好的", "好啊", "可以", "要", "行", "嗯", "没问题", "麻烦你"]);

// Emoji that mean yes. 🛑 Compared as whole strings, never as a character class:
// every one of these is a surrogate PAIR, so /[👍🙏]/ without the `u` flag is a
// class of half-characters that matches 😂, 💩 and 🤬 too. It did, and a Chinese
// refusal with a 🙏 on the end was being answered with a booking link.
const APPROVING_EMOJI = ["👍", "🙏", "👌", "🥊", "✅", "😊", "😍", "💪", "🙌"];

/** Is the whole message an affirmation and nothing else? */
export function isPlainAcceptance(text: string): boolean {
  const raw = (text || "").trim();
  if (!raw) return false;

  // Skin tones and VS-16 are decoration on the same answer: 👍🏽 and 👍 mean the
  // same thing, and leaving the modifier behind made every toned thumbs-up a NO.
  let rest = raw.replace(/\uFE0F/g, "").replace(/\uD83C[\uDFFB-\uDFFF]/g, "");
  let foundApproving = false;
  for (const e of APPROVING_EMOJI) {
    if (rest.includes(e)) {
      foundApproving = true;
      rest = rest.split(e).join("");
    }
  }
  // Only approving emoji were sent. A lone skin-tone modifier is not an answer,
  // which is why this returns the flag rather than "something was removed".
  if (rest.replace(/\s/g, "") === "") return foundApproving;

  // Chinese, judged before the Latin strip below can delete it.
  const cjk = rest.replace(/[\s,，。、!！.?？~]/g, "");
  if (CJK_ACCEPT.has(cjk)) return true;

  // 🛑 Anything non-ASCII still here is text this function cannot read, and the
  // strip below would silently DELETE it — which is how "ok 不用了" (ok, no
  // need — a refusal) and "ok 我要报名会员" (ok, I want to sign up) were read as
  // plain acceptances and answered with a sales link. Never guess yes on words
  // we have not understood; the model handles them properly.
  if (/[^\x00-\x7F]/.test(rest)) return false;

  const words = rest
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  return words.every((w) => ACCEPT_WORD.test(w));
}

/**
 * Is this message the answer to our own "want me to send you the booking link?"
 * — and nothing else?
 *
 * Deliberately narrow. The first version of this only checked the marker and
 * "not a refusal", and it hijacked the whole turn after every price quote: a
 * lead saying "i want to sign up for the unlimited membership" got a drop-in
 * link and Jeremy was never pinged, and "what time is the kids class on
 * saturday?" got an adult $42 pitch. (Caught by the /predeploy review lane,
 * 12 Sep 2026 — the hole was in the fix for Arthur.)
 *
 * A yes is SHORT, carries no question of its own, is not a buy signal, is not
 * something the timetable layer can answer properly, and follows the offer
 * within a day.
 */
export function isOfferAcceptance(a: {
  lastAssistant: string;
  text: string;
  /** Truthy when detectJoinIntent fired — a buy signal outranks this entirely. */
  joinHit?: unknown;
  /** True when buildDeterministicAnswer can answer the message properly. */
  hasDeterministicAnswer: boolean;
  /** Age of the offer message. null when unknown — treated as too old. */
  offerAgeMs: number | null;
  maxWords?: number;
  maxAgeMs?: number;
}): boolean {
  const { lastAssistant, text, joinHit, hasDeterministicAnswer, offerAgeMs } = a;
  const maxWords = a.maxWords ?? 6;
  const maxAgeMs = a.maxAgeMs ?? 24 * 60 * 60 * 1000;
  if (!hasBookingOffer(lastAssistant)) return false;
  if (!acceptsBookingOffer(text)) return false;
  // The message must BE the acceptance, not merely contain no refusal.
  if (!isPlainAcceptance(text)) return false;
  if (joinHit) return false;
  if (hasDeterministicAnswer) return false;
  if (text.includes("?")) return false;
  if (text.trim().split(/\s+/).length > maxWords) return false;
  if (offerAgeMs === null || offerAgeMs > maxAgeMs) return false;
  return true;
}

// ── Fact-sheet parsing ───────────────────────────────────────────────────────
// Everything below reads the sheet and returns null the moment it sees a shape
// it doesn't recognise. null is always safe: the caller falls through to the AI.

export type ScheduleDay = { label: string; canonical: string; entries: ScheduleEntry[] };
export type ScheduleEntry = { text: string; startHour: number | null };
export type ParsedSchedule = { days: ScheduleDay[] };

export type PriceTier = { label: string; firstOption: string; isDropIn: boolean };
export type ParsedPricing = { tiers: PriceTier[] };

/** Pull one `=== HEADER ===` block out of the sheet. Returns header + body. */
function section(facts: string, match: string): { header: string; body: string } | null {
  const lines = facts.split("\n");
  const needle = match.toLowerCase();
  let start = -1;
  let header = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("===") && l.endsWith("===") && l.toLowerCase().includes(needle)) {
      start = i + 1;
      header = l;
      break;
    }
  }
  if (start === -1) return null;
  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("===") && l.endsWith("===")) break;
    body.push(lines[i]);
  }
  return { header, body: body.join("\n") };
}

/**
 * Abbreviation legend from the section header, e.g. "(Mon–Sat; AL = All Levels)".
 * We expand these before sending — "7:00–8:00am AL" means nothing to a customer.
 */
function legendFrom(header: string): Array<[RegExp, string]> {
  const out: Array<[RegExp, string]> = [];
  const re = /\b([A-Za-z]{1,5})\s*=\s*([A-Za-z][A-Za-z '\/-]{2,30}?)\s*(?=[;,)]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header))) {
    out.push([new RegExp(`\\b${m[1]}\\b`, "g"), m[2].trim()]);
  }
  return out;
}

/**
 * "7:00–8:00am" / "12:15–1:15pm" / "11:30am–12:30pm" → start hour in 24h.
 * The start often has no am/pm of its own — borrow the end's, which is how
 * humans read the range. Returns null if the entry isn't a time range at all
 * (e.g. Sunday's "no group classes"), which is fine: it just can't be filtered.
 */
export function startHourOf(text: string): number | null {
  const m = text.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
  );
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mer = (m[3] || m[6]).toLowerCase();
  if (h === 12) h = 0;
  if (mer === "pm") h += 12;
  return h;
}

export function parseSchedule(facts: string, cfg: DeterministicConfig = DEFAULT_CONFIG): ParsedSchedule | null {
  const sec = section(facts, cfg.scheduleSectionMatch);
  if (!sec) return null;
  const legend = legendFrom(sec.header);

  const days: ScheduleDay[] = [];
  for (const rawLine of sec.body.split("\n")) {
    const line = rawLine.trim();
    const m = line.match(/^[-•*]\s*([^:]{2,20}?)\s*:\s*(.+)$/);
    if (!m) continue;
    const label = m[1].trim();
    const canonical = canonicalDay(label, cfg);
    if (!canonical) continue; // not a day line — ignore quietly
    const entries = m[2]
      .split(/\s*[·|]\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        let text = s;
        for (const [re, full] of legend) text = text.replace(re, full);
        return { text, startHour: startHourOf(s) };
      });
    if (entries.length === 0) continue;
    days.push({ label, canonical, entries });
  }

  // Degrade, don't guess. A sheet we half-understand is worse than no sheet:
  // fewer than 3 recognised days, or times we can't read anywhere, means the
  // format moved under us → hand the question back to the AI.
  if (days.length < 3) return null;
  const withTimes = days.reduce((n, d) => n + d.entries.filter((e) => e.startHour !== null).length, 0);
  if (withTimes === 0) return null;
  return { days };
}

export function parsePricing(facts: string, cfg: DeterministicConfig = DEFAULT_CONFIG): ParsedPricing | null {
  const sec = section(facts, cfg.pricingSectionMatch);
  if (!sec) return null;

  const tiers: PriceTier[] = [];
  for (const rawLine of sec.body.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("-") && !line.startsWith("•")) continue;
    const body = line.replace(/^[-•]\s*/, "");
    const colon = body.indexOf(":");
    if (colon === -1) continue;
    const label = body.slice(0, colon).trim();
    const rest = body.slice(colon + 1).trim();
    if (!label || label.includes("$") || !rest.includes("$")) continue;
    const firstOption = rest.split(/\s*[·|]\s*/)[0].trim();
    if (!firstOption.includes("$")) continue;
    tiers.push({ label, firstOption, isDropIn: cfg.dropInLabel.test(label) });
  }

  if (tiers.every((t) => t.isDropIn) || tiers.length === 0) return null;
  return { tiers };
}

// ── Intent detection ─────────────────────────────────────────────────────────

export type Intent = "SCHEDULE" | "PRICE";
export type Detection = {
  intent: Intent | null;
  score: number;
  /** Why we did NOT intercept — for logging / debugging only. */
  reason?: string;
  day?: string; // canonical sheet day label, e.g. "Mon"
  window?: string; // key of cfg.timeWindows
  youth?: boolean;
};

// Letters we treat as word characters: latin + accented + CJK + kana + hangul.
// (No \p{L}/u — the project's TS target rejects unicode property escapes; same
// reason as NAME_LETTERS in jai-reply.ts.)
const WORD_CHARS = "A-Za-z0-9\\u00C0-\\u024F\\u4E00-\\u9FFF\\u3040-\\u30FF\\uAC00-\\uD7AF";
const NON_WORD = new RegExp(`[^${WORD_CHARS}]+`, "g");

/** Lowercase; punctuation → spaces so ASCII phrases match on word boundaries.
 *  CJK is left in place and matched by substring. */
function norm(text: string): string {
  return ` ${text.toLowerCase().replace(NON_WORD, " ").trim()} `;
}

function hit(haystackPadded: string, rawLower: string, kw: string): boolean {
  if (/^[\x20-\x7e]+$/.test(kw)) return haystackPadded.includes(` ${kw.toLowerCase()} `);
  return rawLower.includes(kw); // CJK etc. — no word boundaries to lean on
}

function countHits(padded: string, rawLower: string, list: string[]): number {
  return list.filter((k) => hit(padded, rawLower, k)).length;
}

export function canonicalDay(text: string, cfg: DeterministicConfig = DEFAULT_CONFIG): string | null {
  const padded = norm(text);
  const lower = text.toLowerCase();
  let best: { day: string; len: number } | null = null;
  for (const [day, aliases] of Object.entries(cfg.dayAliases)) {
    for (const a of aliases) {
      if (hit(padded, lower, a) && (!best || a.length > best.len)) best = { day, len: a.length };
    }
  }
  return best ? best.day : null;
}

/** Canonical sheet day label for today / today+n in the tenant's timezone. */
function dayLabelNow(cfg: DeterministicConfig, addDays: number): string | undefined {
  const d = new Date(Date.now() + addDays * 86400000);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone: cfg.timeZone });
  return canonicalDay(weekday, cfg) || undefined;
}

/**
 * Weak schedule hints describe a topic, not the customer's intent. Only take
 * a compact lookup made of schedule terms and question scaffolding. Anything
 * else (a booking update, attendance plan, thanks, or personal story) needs
 * the model to read the conversation. This creates no customer-facing reply.
 */
function isScheduleLookupFragment(text: string, cfg: DeterministicConfig): boolean {
  let remaining = norm(text);
  const terms = [
    ...cfg.classWords, ...cfg.scheduleWeak, ...cfg.todayWords, ...cfg.tomorrowWords,
    ...Object.values(cfg.dayAliases).flat(),
    ...Object.values(cfg.timeWindows).flatMap((window) => window.aliases),
    "do you have", "are there", "is there", "what", "are", "is", "any",
    "on", "for", "the", "your", "a", "please", "pls", "hi", "hello", "got", "ah", "lah",
  ].sort((a, b) => b.length - a.length);
  for (const term of terms) {
    if (/^[\x20-\x7e]+$/.test(term)) remaining = remaining.split(` ${term} `).join(" ");
    else remaining = remaining.split(term).join("");
  }
  return remaining.trim().length === 0;
}

/**
 * Conservative on purpose. A missed interception costs nothing — the model
 * answers exactly as it does today, with Layer 1 guarding it. A WRONG
 * interception sends a real customer a canned answer to a question they didn't
 * ask. So the bar is: one unambiguous phrase ("what time", "how much"), or two
 * weaker hints ("morning" + "class"), AND a short single-subject message with
 * no fall-through topic in it. Everything else → null → the AI.
 */
export function detectIntent(text: string, cfg: DeterministicConfig = DEFAULT_CONFIG): Detection {
  // "who takes the wednesday evening class?" is a question about a PERSON. It
  // contains a day and the word class, so SCHEDULE scored it and answered with
  // a timetable — the customer's actual question never reached the model.
  if (/\b(who|which\s+coach|whose|what.{0,12}\bname\b)\b/i.test(text)) {
    return { intent: null, score: 0, reason: "asks who, not when" };
  }
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const padded = norm(raw);

  if (!raw) return { intent: null, score: 0, reason: "empty" };
  if (raw.length > cfg.maxChars || padded.trim().split(/\s+/).length > cfg.maxWords)
    return { intent: null, score: 0, reason: "too long — likely compound / a story, let the AI read it" };
  if ((raw.match(/\?/g) || []).length > 1)
    return { intent: null, score: 0, reason: "more than one question" };
  if (countHits(padded, lower, cfg.fallThrough) > 0)
    return { intent: null, score: 0, reason: "fall-through topic (trial/booking/PT/member admin/discount)" };
  if (countHits(padded, lower, cfg.otherTopics) > 0)
    return { intent: null, score: 0, reason: "another subject in the same message" };

  const classHit = countHits(padded, lower, cfg.classWords) > 0 ? 1 : 0;

  const schedStrong = countHits(padded, lower, cfg.scheduleStrong);
  const priceStrong = countHits(padded, lower, cfg.priceStrong);
  let sched = 2 * schedStrong + countHits(padded, lower, cfg.scheduleWeak);
  let price = 2 * priceStrong + countHits(padded, lower, cfg.priceWeak);
  const dayNamed = canonicalDay(raw, cfg) !== null || countHits(padded, lower, [...cfg.todayWords, ...cfg.tomorrowWords]) > 0;
  if (dayNamed) sched += 1;
  // A class word only counts once something else has already pointed at a topic
  // ("morning class" → schedule), never on its own ("is the class fun?").
  if (sched > 0) sched += classHit;
  if (price > 0) price += classHit;

  // Topic anchor. Loose words alone are never enough — a bare "tonight" or
  // "monthly" could be about anything ("see you tonight"). We need either an
  // unambiguous phrase ("what time", "how much") or an explicit mention of
  // classes/training/membership before we take the question off the model.
  if (schedStrong === 0 && priceStrong === 0 && classHit === 0)
    return { intent: null, score: Math.max(sched, price), reason: "no topic anchor (no unambiguous phrase, no class word)" };

  if (sched >= cfg.threshold && price >= cfg.threshold)
    return { intent: null, score: 0, reason: "asks about both schedule and price — the AI answers it whole" };

  if (sched >= cfg.threshold) {
    // "I have already booked for tomorrow ... class" used to score 2 from
    // day + class alone and return a timetable before DeepSeek ever ran.
    // Ambiguous sentences fall through intact; explicit "what time" queries
    // still use the fact-sheet lookup and all downstream fact guards remain.
    if (schedStrong === 0 && !isScheduleLookupFragment(raw, cfg)) {
      return { intent: null, score: sched, reason: "schedule mentioned in conversation, not a clear lookup" };
    }
    let day = canonicalDay(raw, cfg) || undefined;
    if (!day && countHits(padded, lower, cfg.todayWords) > 0) day = dayLabelNow(cfg, 0);
    if (!day && countHits(padded, lower, cfg.tomorrowWords) > 0) day = dayLabelNow(cfg, 1);
    let window: string | undefined;
    for (const [key, w] of Object.entries(cfg.timeWindows)) {
      if (countHits(padded, lower, w.aliases) > 0) { window = key; break; }
    }
    return { intent: "SCHEDULE", score: sched, day, window };
  }
  if (price >= cfg.threshold) {
    return { intent: "PRICE", score: price, youth: countHits(padded, lower, cfg.youthWords) > 0 };
  }
  return { intent: null, score: Math.max(sched, price), reason: "below confidence threshold" };
}

// ── Answer building ──────────────────────────────────────────────────────────

export type DeterministicAnswer = {
  intent: Intent;
  messageText: string;
  quickReplies: string[];
};

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function scheduleAnswer(
  det: Detection,
  sched: ParsedSchedule,
  cfg: DeterministicConfig
): DeterministicAnswer | null {
  const c = cfg.copy;
  const win = det.window ? cfg.timeWindows[det.window] : null;
  const inWindow = (e: ScheduleEntry) =>
    !win || (e.startHour !== null && e.startHour >= win.fromHour && e.startHour < win.toHour);

  // A day was named → answer for that day only ("don't dump the whole schedule").
  if (det.day) {
    const day = sched.days.find((d) => d.canonical === det.day);
    if (!day) return null; // the sheet doesn't list that day in a shape we know
    const entries = day.entries.filter(inWindow);
    if (entries.length === 0) {
      // No classes in the asked-for window on that day. Say so plainly and give
      // the rest of that day rather than nothing.
      const all = day.entries.map((e) => `• ${e.text}`).join("\n");
      const head = fill(c.scheduleNothingOnDay, { window: det.window || "", day: day.label });
      return {
        intent: "SCHEDULE",
        messageText: `${head}\n\n${fill(c.scheduleDayIntro, { day: day.label })}\n${all}\n\n${c.scheduleTrailer}`,
        quickReplies: c.quickReplies.schedule,
      };
    }
    // A day with no times at all in the sheet (e.g. "Sun: no group classes")
    // reads badly as a bullet list — say it as a sentence.
    const body = entries.every((e) => e.startHour === null)
      ? `*${day.label}*: ${entries.map((e) => e.text).join(", ")}`
      : `${fill(c.scheduleDayIntro, { day: day.label })}\n${entries.map((e) => `• ${e.text}`).join("\n")}`;
    return {
      intent: "SCHEDULE",
      messageText: `${body}\n\n${c.scheduleTrailer}`,
      quickReplies: c.quickReplies.schedule,
    };
  }

  // No day, but a time of day ("do you have morning class?") → the slice of the
  // week that matches. Still a slice, not the whole timetable.
  if (win) {
    const lines: string[] = [];
    for (const d of sched.days) {
      const es = d.entries.filter(inWindow);
      if (es.length > 0) lines.push(`• *${d.label}*: ${es.map((e) => e.text).join(", ")}`);
    }
    if (lines.length === 0) {
      return {
        intent: "SCHEDULE",
        messageText: `${fill(c.scheduleNothingInWindow, { window: det.window || "" })}\n\n${c.scheduleTrailer}`,
        quickReplies: c.quickReplies.schedule,
      };
    }
    return {
      intent: "SCHEDULE",
      messageText: `${fill(c.scheduleWindowIntro, { window: det.window || "" })}\n${lines.join("\n")}\n\n${c.scheduleTrailer}`,
      quickReplies: c.quickReplies.schedule,
    };
  }

  // Neither → ask which day rather than dumping six days of times at them.
  const named = sched.days.filter((d) => d.entries.some((e) => e.startHour !== null));
  if (named.length === 0) return null;
  const range = named.length > 1 ? `${named[0].label}–${named[named.length - 1].label}` : named[0].label;
  return {
    intent: "SCHEDULE",
    messageText: fill(c.scheduleNoDayAsk, { days: range }),
    quickReplies: c.quickReplies.schedule,
  };
}

function priceAnswer(
  det: Detection,
  pricing: ParsedPricing,
  cfg: DeterministicConfig
): DeterministicAnswer | null {
  const tiers = pricing.tiers.filter((t) => !t.isDropIn);
  if (tiers.length === 0) return null;
  let tier = tiers[0];
  let isYouthTier = false;
  if (det.youth) {
    const match = tiers.find((t) =>
      cfg.youthWords.some((w) => hit(norm(t.label), t.label.toLowerCase(), w))
    );
    if (match) {
      tier = match;
      isYouthTier = true;
    }
  }
  // Starting price only — the sheet's own rule is to lead with one number and
  // funnel to the free trial, not to dump the full price list.
  return {
    intent: "PRICE",
    messageText:
      `${fill(cfg.copy.priceIntro, { tier: tier.label, price: tier.firstOption })}\n\n${
        isYouthTier ? cfg.copy.priceTrailerYouth : cfg.copy.priceTrailer
      }`,
    quickReplies: cfg.copy.quickReplies.price,
  };
}

/**
 * The whole of Layer 2 in one call: message in, ready-to-send reply out, or
 * null meaning "not confident / sheet not in a shape I understand — let the AI
 * answer this one".
 *
 * `facts` is passed in (not imported) so the caller decides where the sheet
 * comes from — the JAI_FACTS constant today, a DB row (getJaiFacts()) tomorrow,
 * another tenant's sheet after that.
 */

/**
 * Answer for a day we ALREADY know, skipping intent detection entirely.
 *
 * detectIntent is deliberately conservative because for the Layer 2 intercept
 * `null` means "let the AI answer" — a safe default there. The reply-substitution
 * path needs the opposite bias: by the time it runs we have already decided the
 * model's own answer is not trustworthy, so `null` there means "ask the customer
 * which day", and that produced the worst bug of the whole build — a customer who
 * wrote "can I come Monday at 7:30pm?" was asked which day they meant, twice,
 * because a bare day word never satisfies detectIntent's topic anchor.
 *
 * So: if we know the day, answer for the day.
 */
export function scheduleAnswerForDay(
  day: string,
  facts: string,
  baseCfg: DeterministicConfig = DEFAULT_CONFIG,
  /**
   * The day came from an earlier turn, so there is no message to read the
   * language off here — the caller passes it. Defaults to English, i.e. exactly
   * today's behaviour for every caller that does not.
   */
  lang: Lang = "en"
): DeterministicAnswer | null {
  const cfg = configForLang(baseCfg, lang);
  try {
    const sched = parseSchedule(facts, cfg);
    if (!sched) return null;
    return scheduleAnswer({ intent: "SCHEDULE", score: 99, day }, sched, cfg);
  } catch {
    return null;
  }
}

// ── Late arrival — deterministic, because the model flips a coin on it ───────
// The sheet states a hard 15-minute cutoff in plain words and quotes a worked
// example. Round 5 still produced "as long as you're in by 7:45pm, you're good
// to join" for a 7:30pm class — the exact wrong answer Coach Jeremy had to
// override live on 31 Aug — and got it right on a differently-worded turn. A
// boundary the business cares about should not be a coin flip, so it moves out
// of the prompt entirely.
const CUTOFF_MINUTES = 15;

/** "745", "7.45pm", "7:45 pm", "8pm" -> minutes since midnight, or null. */
function clockToMinutes(raw: string): { mins: number; bare: boolean } | null {
  const m = /^(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  let min = m[2] ? parseInt(m[2], 10) : 0;
  // "745" with no separator is 7:45, not 745 o'clock.
  if (!m[2] && m[1].length >= 3) {
    h = parseInt(m[1].slice(0, m[1].length - 2), 10);
    min = parseInt(m[1].slice(-2), 10);
  }
  if (min > 59 || h > 23) return null;
  const mer = m[3]?.toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  // A bare hour has no half of the day. Defaulting 1-9 to PM was right for the
  // evening classes and catastrophically wrong for the morning ones: "i'll reach
  // at 7.05 for the 7am class" became 19:05 against a 07:00 start, i.e. 725
  // minutes late, and a real member got a confident deterministic refusal that
  // no later layer could correct. The caller passes the class's own meridiem so
  // a bare arrival inherits it.
  if (!mer && h >= 1 && h <= 9) return { mins: h * 60 + min, bare: true };
  return { mins: h * 60 + min, bare: false };
}

export type LateArrivalAnswer = { messageText: string; canJoin: boolean };

/**
 * If the customer is telling us how late they will be, answer it from the rule
 * rather than from the model. Returns null whenever we cannot pin down both the
 * class and the arrival — the caller then falls through as usual.
 */
export function lateArrivalAnswer(
  text: string,
  baseCfg: DeterministicConfig = DEFAULT_CONFIG,
  /**
   * Recent turns, newest last. The class time is very often NOT in the message
   * that states the arrival: Kenneth's real thread ran "can i come today ?" →
   * "too late" → "oh so if i reach at 745 its ok ?", with the 7:30pm class three
   * turns back. A single-message parser found no class, returned null, and the
   * model answered "you're good to join" — the exact thing Coach Jeremy had to
   * override live. The suite missed it because its test case appends "for the
   * 730 class", which the real customer never wrote.
   */
  context: string[] = []
): LateArrivalAnswer | null {
  // The gate below is English-only ("late", "reach", "arrive"), so a wholly
  // Chinese message never reaches this layer at all — it goes to the model,
  // which answers Chinese correctly. This matters for the mixed messages that
  // DO get through, e.g. "我 late 10 min ok?".
  const cfg = configForLang(baseCfg, detectLang([text, ...context].join(" ")));
  try {
    const t = (text || "").toLowerCase();
    if (!/\b(late|reach|arrive|arriving|get\s+there|be\s+there|make\s+it)\b/.test(t)) return null;

    // This intercept now runs BEFORE the model and before the greeting, so a
    // false fire sends a class refusal to someone who never asked about a class.
    // Two guards:
    //
    // 1. Tense. "I was 20 minutes late to work today" carries a number and the
    //    word late and means nothing about attending. "I'll be 20 minutes late"
    //    is a question about whether they can still come. Only the second is a
    //    request for the cutoff rule.
    if (/\b(was|were|been|got|arrived|reached)\s+(\w+\s+){0,2}late\b/.test(t)) return null;
    // 2. The phrases where "late" is not about arriving at all.
    if (/\blate\s+(reply|replies|replying|response|responding|answer|notice)\b/.test(t)) return null;
    if (/\bsorry\s+for\s+the\s+late\b/.test(t)) return null;
    if (/\blate\s+(to|for)\s+(work|school|the\s+office|dinner|a\s+meeting)\b/.test(t)) return null;
    // 3. Topics that carry a MANDATORY escalation of their own. A trial that is
    //    being missed must still fire TRIAL_CANCEL or the slot stays blocked and
    //    the reminders keep firing; PT is Jeremy's and always escalates. Answering
    //    those with the canned class refusal skips the model AND the escalation,
    //    so hand them back. Deliberately its own short list, not cfg.fallThrough —
    //    that list exists for a different question and reusing it has bitten once.
    if (/\b(trial|free\s+class|percubaan|pt|personal\s+training|private\s+class|1-1|one\s+to\s+one)\b|试课|試課|体验课|體驗課/.test(t)) return null;
    // "is it too late to sign up / to join the promo" is a buy question.
    if (/\btoo\s+late\s+to\s+(sign|join|register|book\s+the|get)\b/.test(t)) return null;

    // "the 6.30pm class", "for the 730 class"
    // The class may have been named earlier in the conversation. Search this
    // message first, then walk back through recent turns, newest first.
    // [\w-] not \w: JAI writes "7:30pm All-Levels class", and \w+ cannot match
    // the hyphen, so this pattern found nothing in the bot's own words. The
    // round-7 suite hid it because the fixture was my hand-written "The 7:30pm
    // class starts soon" rather than what JAI actually says.
    // [\w-] not \w — JAI writes "7:30pm All-Levels class" and \w cannot match the
    // hyphen, so this found nothing in the bot's own words. Kept at TWO filler
    // words: widening to three let "reach at 645 for the 630 class" capture the
    // ARRIVAL time as the class, and the lateness came out as zero.
    const CLASS_RE = /(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm)?)\s*(?:[\w-]+\s+){0,2}(?:class|session|slot)/i;
    let clsM = CLASS_RE.exec(t);
    if (!clsM) {
      for (const prev of [...context].reverse()) {
        const m = CLASS_RE.exec((prev || "").toLowerCase());
        if (m) { clsM = m; break; }
      }
    }
    // 🛑 "in 20 minutes" is a DURATION from now, not a clock time. The bare
    // `in` in the alternation below read it as 20:00, so a member messaging at
    // 19:00 that they arrive in 20 minutes — ten minutes EARLY for the 19:30
    // class — was deterministically told they could not join. No model, no
    // later override. Hand a relative arrival back to the model instead of
    // guessing: null is always safe. (Found 11 Sep 2026.)
    if (/\bin\s+(?:a\s+)?(?:\d{1,3}|ten|fifteen|twenty|thirty|few)\s*(?:mins?|minutes?|hrs?|hours?)\b/i.test(t)) {
      return null;
    }
    // "reach at 745", "arrive 8pm", "be there by 7.45"
    // No bare `in` here — see the guard above.
    const arrM = /(?:reach|arrive|arriving|get\s+there|be\s+there)\s*(?:at|by|around)?\s*(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm)?)/i.exec(t);
    // "20 minutes late", "fifteen mins late"
    const words: Record<string, number> = { ten: 10, fifteen: 15, twenty: 20, thirty: 30 };
    // "…20 minutes late" and "…fifteen minutes after it starts" are the same
    // statement; the second phrasing was a real round-5 miss.
    const lateM =
      /(\d{1,2}|ten|fifteen|twenty|thirty)\s*(?:mins?|minutes?)\s*(?:late|after)/i.exec(t);

    let lateBy: number | null = null;
    if (lateM) {
      const v = lateM[1].toLowerCase();
      lateBy = words[v] ?? parseInt(v, 10);
    } else if (clsM && arrM) {
      const start = clockToMinutes(clsM[1]);
      const arrive = clockToMinutes(arrM[1]);
      if (start === null || arrive === null) return null;
      let s0 = start.mins;
      let a0 = arrive.mins;
      // Resolve bare hours against whichever side DID carry a meridiem. If
      // neither did, they are in the same half of the day as each other, which
      // is all the difference needs.
      if (start.bare && !arrive.bare && a0 >= 12 * 60) s0 += 12 * 60;
      if (arrive.bare && !start.bare && s0 >= 12 * 60) a0 += 12 * 60;
      lateBy = a0 - s0;
      // A negative gap means we guessed the halves wrong (e.g. "7.05" vs "7am"
      // read as 19:05 vs 07:00 would give +725, and the reverse gives -725).
      // Anything beyond a plausible lateness is a parse we should not act on.
      if (lateBy < 0 || lateBy > 180) return null;
    }
    if (lateBy === null || lateBy < 0) return null;

    const c = cfg.copy;
    if (lateBy < CUTOFF_MINUTES) {
      return { canJoin: true, messageText: c.lateOk.replace("{mins}", String(lateBy)) };
    }
    return { canJoin: false, messageText: c.lateTooLate.replace("{cutoff}", String(CUTOFF_MINUTES)) };
  } catch {
    return null;
  }
}

export function buildDeterministicAnswer(
  text: string,
  facts: string,
  baseCfg: DeterministicConfig = DEFAULT_CONFIG
): DeterministicAnswer | null {
  // Answer in the language she asked in. Detection reads her message only, so
  // the intent parse below is unaffected — the keyword lists already carry both
  // languages ("今天", "早上"), it was only the OUTGOING copy that was English.
  const cfg = configForLang(baseCfg, detectLang(text));
  const det = detectIntent(text, cfg);
  if (!det.intent) return null;
  try {
    if (det.intent === "SCHEDULE") {
      const sched = parseSchedule(facts, cfg);
      return sched ? scheduleAnswer(det, sched, cfg) : null;
    }
    const pricing = parsePricing(facts, cfg);
    return pricing ? priceAnswer(det, pricing, cfg) : null;
  } catch {
    return null; // any surprise in the sheet → the AI handles it
  }
}
