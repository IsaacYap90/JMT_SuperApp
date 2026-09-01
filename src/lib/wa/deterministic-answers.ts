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
  copy: {
    scheduleDayIntro: string; // {day}
    scheduleWindowIntro: string; // {window}
    scheduleNoDayAsk: string; // {days}
    scheduleNothingInWindow: string; // {window}
    scheduleTrailer: string;
    lateOk: string;
    lateTooLate: string;
    priceIntro: string; // {tier} {price}
    priceTrailer: string;
    quickReplies: { schedule: string[]; price: string[] };
  };
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
    "pre-teen", "preteen", "student", "students", "nsf", "under 21", "anak",
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
    morning: { aliases: ["morning", "am class", "pagi", "早上", "早班"], fromHour: 0, toHour: 11 },
    afternoon: { aliases: ["afternoon", "lunch", "lunchtime", "noon", "petang", "下午", "中午"], fromHour: 11, toHour: 17 },
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
    quickReplies: {
      schedule: ["Today", "Tomorrow"],
      price: ["Book a class"],
    },
  },
};

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
      const head = fill(c.scheduleNothingInWindow, { window: det.window || "" });
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
  if (det.youth) {
    const match = tiers.find((t) =>
      cfg.youthWords.some((w) => hit(norm(t.label), t.label.toLowerCase(), w))
    );
    if (match) tier = match;
  }
  // Starting price only — the sheet's own rule is to lead with one number and
  // funnel to the free trial, not to dump the full price list.
  return {
    intent: "PRICE",
    messageText:
      `${fill(cfg.copy.priceIntro, { tier: tier.label, price: tier.firstOption })}\n\n${cfg.copy.priceTrailer}`,
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
  cfg: DeterministicConfig = DEFAULT_CONFIG
): DeterministicAnswer | null {
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
  cfg: DeterministicConfig = DEFAULT_CONFIG,
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
    // "reach at 745", "arrive 8pm", "be there by 7.45"
    const arrM = /(?:reach|arrive|arriving|get\s+there|be\s+there|in)\s*(?:at|by|around)?\s*(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm)?)/i.exec(t);
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
  cfg: DeterministicConfig = DEFAULT_CONFIG
): DeterministicAnswer | null {
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
