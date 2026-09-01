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
    priceIntro: "*{tier}*\n{price}",
    priceTrailer:
      "Everyone gets a FREE trial class first though — want me to send you the booking link? 🥊",
    quickReplies: {
      schedule: ["Today", "Tomorrow"],
      price: ["Book a trial"],
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
