// ============================================================================
// FACT GUARD — Layer 1: deterministic check of a model DRAFT against the sheet
// ============================================================================
// The model is TOLD to quote the fact sheet exactly. Twice (2026-07-20 and
// 2026-08-31) it invented class times ("7:00-8:00pm") anyway. Prompting has
// failed, so this runs OUTSIDE the model: every draft reply is scanned for
// three classes of expensive-when-wrong token — TIMES, PRICES, LINKS — and any
// token that is not present in the fact sheet blocks the reply.
//
// DESIGN RULES
//  • Multi-tenant: the fact sheet is an ARGUMENT. No gym-specific value lives
//    in the logic — tenant specifics belong in a FactGuardConfig (see
//    JMT_FACT_GUARD_CONFIG at the bottom, the only JMT-flavoured thing here).
//  • Cheap + synchronous: pure regex over two strings, no I/O, no network.
//    Sheet extraction is memoised so the common path is one pass over a short
//    reply.
//  • FALSE POSITIVES ARE ALSO A BUG. A bare number is never a time or a price.
//    Times need an am/pm (their own, or inherited from the other end of their
//    range); prices need a currency marker. So "since 2006", "age 3+",
//    "15 and above", "+65 9238 3071", "6 to 12 people", "15-minute buffer",
//    "10% discount" and "capped at 8" are all invisible to this guard.
//  • Fail open, loudly: callers use `validateReply`, which never throws — on an
//    internal error it returns ok:true with `error` set and logs. A broken
//    guard must never take the assistant offline; only a real violation blocks.
//
// KNOWN LIMITS (deliberate)
//  • Range ENDPOINTS are checked, not the range as a unit — "6:30pm to 9:30pm"
//    passes because both ends are real class times. Checking pairs would block
//    honest spans; the failure this guard exists to stop (a start time that
//    does not exist) is caught either way.
//  • A time that only exists in live data (e.g. a Calendly trial slot the
//    customer booked) is not in the sheet. If the model restates one and the
//    customer never wrote it, the reply is blocked and handed to Coach Jeremy —
//    the safe direction, but worth knowing.
// ============================================================================

export type ViolationKind = "time" | "price" | "link" | "day";

export type Violation = {
  kind: ViolationKind;
  /** The token exactly as the model wrote it — used in the corrective retry. */
  token: string;
  /** Canonical form the membership test was done on (for logs). */
  normalised: string;
};

export type FactCheckResult = {
  ok: boolean;
  violations: Violation[];
  /** Set when the guard itself failed; ok is forced true (fail open). */
  error?: string;
};

export type FactGuardConfig = {
  /**
   * Links the assistant may legitimately send that can never appear in the
   * fact sheet because they are built at runtime. Each entry is "host" or
   * "host/path-prefix" and is matched against the normalised link.
   */
  allowedRuntimeLinks: string[];
  /**
   * Words that mark a sentence as *correcting* a value the customer wrote
   * ("no, there's no 7pm class — closest is 6:30pm"). A time/price the
   * CUSTOMER used is allowed to be echoed back inside such a sentence; the
   * assistant is referring to their number, not asserting a new fact.
   * English by default; a tenant in another language swaps this list.
   */
  negationCues: string[];
};

export const DEFAULT_FACT_GUARD_CONFIG: FactGuardConfig = {
  allowedRuntimeLinks: [],
  negationCues: [
    "no", "not", "n't", "never", "unfortunately", "sorry", "afraid",
    "closest", "nearest", "instead", "but we", "only have", "we have",
  ],
};

// ── time extraction ─────────────────────────────────────────────────────────
// A time is <hour>[:.<minutes>][am|pm]. The meridiem is REQUIRED, except on the
// left side of a range, where it is inherited from the right side
// ("6:30-7:30pm" → 6:30pm, "10-11am" → 10am). Inheritance is resolved by
// clock order: if inheriting would put the start at/after the end, the other
// meridiem is used ("11:30am-12:30pm" is not 11:30pm-12:30pm).
// The separator may not cross a newline, so a bullet "- " on the next line can
// never be read as a range dash.
const TIME_RANGE_RE =
  /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:[ \t]*[-–—][ \t]*|[ \t]+to[ \t]+)(\d{1,2})(?:[:.](\d{2}))?[ \t]*(am|pm)\b/gi;
const TIME_SINGLE_RE = /\b(\d{1,2})(?:[:.](\d{2}))?[ \t]*(am|pm)\b/gi;

function toMinutes(hourStr: string, minStr: string | undefined, mer: string): number | null {
  let h = parseInt(hourStr, 10);
  const m = minStr ? parseInt(minStr, 10) : 0;
  if (!(h >= 1 && h <= 12) || m > 59) return null; // "13pm", "7:75pm" → not a time
  const pm = mer.toLowerCase() === "pm";
  if (h === 12) h = 0;
  return (pm ? h + 12 : h) * 60 + m;
}

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export type Token = { raw: string; norm: string };

/** Every time in `text`, normalised to 24h "HH:MM". Same function for sheet and reply. */
export function extractTimes(text: string): Token[] {
  const out: Token[] = [];
  // Ranges first, then blank them out so their halves aren't re-read as singles.
  const masked = text.replace(
    TIME_RANGE_RE,
    (full: string, h1: string, m1: string | undefined, mer1: string | undefined, h2: string, m2: string | undefined, mer2: string) => {
      const end = toMinutes(h2, m2, mer2);
      if (end === null) return full; // not a time after all — leave it for the single pass
      let start = toMinutes(h1, m1, mer1 || mer2);
      if (start === null) return full;
      if (!mer1 && start >= end) {
        // Inheriting the end's meridiem crossed midday — take the other one.
        const flipped = toMinutes(h1, m1, mer2.toLowerCase() === "pm" ? "am" : "pm");
        if (flipped !== null) start = flipped;
      }
      const rawStart = `${h1}${m1 ? ":" + m1 : ""}${mer1 || mer2}`;
      const rawEnd = `${h2}${m2 ? ":" + m2 : ""}${mer2}`;
      out.push({ raw: rawStart, norm: hhmm(start) }, { raw: rawEnd, norm: hhmm(end) });
      return " ".repeat(full.length);
    }
  );
  let m: RegExpExecArray | null;
  TIME_SINGLE_RE.lastIndex = 0;
  while ((m = TIME_SINGLE_RE.exec(masked)) !== null) {
    const mins = toMinutes(m[1], m[2], m[3]);
    if (mins !== null) out.push({ raw: m[0].trim(), norm: hhmm(mins) });
  }
  return out;
}

/**
 * Ranges and standalone times, kept APART. `extractTimes` flattens a range into
 * two loose tokens, which is right for "does this time exist at all" but wrong
 * for day binding: the end of a valid range would then be re-tested as if it
 * were a class start and rejected.
 */
export function extractTimeParts(text: string): {
  ranges: { start: Token; end: Token; at: number }[];
  singles: (Token & { at: number })[];
} {
  const ranges: { start: Token; end: Token; at: number }[] = [];
  // `raw` is REBUILT from the parsed parts ("4:30pm"), so it often does not
  // appear literally in the text ("4:30-5:15pm"). Searching for it returned -1
  // and bound every time to the first day in the sentence. Take the offset from
  // the match itself.
  const masked = text.replace(TIME_RANGE_RE, (full: string, ...rest: unknown[]) => {
    const at = rest[rest.length - 2] as number;
    const both = extractTimes(full);
    if (both.length === 2) ranges.push({ start: both[0], end: both[1], at });
    return " ".repeat(full.length);
  });
  // Parse the match directly. Calling extractTimes() in here would reset the
  // lastIndex of this same global regex and spin forever.
  const singles: (Token & { at: number })[] = [];
  let m: RegExpExecArray | null;
  TIME_SINGLE_RE.lastIndex = 0;
  while ((m = TIME_SINGLE_RE.exec(masked)) !== null) {
    const mins = toMinutes(m[1], m[2], m[3]);
    if (mins !== null) singles.push({ raw: m[0].trim(), norm: hhmm(mins), at: m.index });
  }
  return { ranges, singles };
}

// ── price extraction ────────────────────────────────────────────────────────
// A price needs a currency marker, so no bare number is ever read as one.
// Canonical form: <SYMBOL><integer digits> — "RM 1,400", "RM1400.00" and
// "MYR1400" all collapse to "RM1400"; "$250/month" to "$250".
const PRICE_RE = /(RM|MYR|SGD|USD|S\$|US\$|\$|£|€)\s*(\d[\d,]*(?:\.\d{1,2})?)\b/gi;
const CURRENCY_ALIASES: Record<string, string> = {
  MYR: "RM", RM: "RM", SGD: "$", "S$": "$", USD: "$", "US$": "$", $: "$", "£": "£", "€": "€",
};

export function extractPrices(text: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  PRICE_RE.lastIndex = 0;
  while ((m = PRICE_RE.exec(text)) !== null) {
    const sym = CURRENCY_ALIASES[m[1].toUpperCase()] || CURRENCY_ALIASES[m[1]] || m[1];
    const amount = m[2].replace(/,/g, "").replace(/\.00?$/, "");
    out.push({ raw: m[0].trim(), norm: `${sym}${amount}` });
  }
  return out;
}

// ── link extraction ─────────────────────────────────────────────────────────
// Normalised to "host/path": scheme dropped, host lowercased and de-www'd,
// trailing sentence punctuation and a trailing slash stripped, query + hash
// dropped (a tracking/prefill param must not turn a correct link into a
// violation — the destination is what matters).
const LINK_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi;

export function normaliseLink(url: string): string {
  let s = url.trim().replace(/[.,;:!?)\]}>"']+$/, "");
  s = s.replace(/^https?:\/\//i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const slash = s.indexOf("/");
  const host = (slash === -1 ? s : s.slice(0, slash)).toLowerCase().replace(/^www\./, "");
  const path = slash === -1 ? "" : s.slice(slash);
  return host + path;
}

export function extractLinks(text: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    const norm = normaliseLink(m[0]);
    if (norm) out.push({ raw: m[0].replace(/[.,;:!?)\]}>"']+$/, ""), norm });
  }
  return out;
}

function linkAllowed(norm: string, allow: string[]): boolean {
  return allow.some((entry) => {
    const e = normaliseLink(entry);
    return !!e && (norm === e || norm.startsWith(e + "/"));
  });
}

// TRUE negations only. `negationCues` in the config is a deliberately loose list
// used for the ECHO allowance, where the token must ALSO be one the customer
// wrote — there "we have" is a harmless extra signal. It must never be reused as
// a standalone negation test: "Yes, we have a 7pm class on Monday!" matches it,
// and reusing it exempted exactly the assertion this guard exists to stop.
const TRUE_NEGATION_RE =
  /\b(no|not|n't|never|none|cannot|unfortunately|afraid|isn't|aren't|don't|doesn't|won't)\b/i;

// ── day binding ─────────────────────────────────────────────────────────────
// Checking that a time exists SOMEWHERE in the sheet is not the same as checking
// it exists on the day the model attached it to. E2E on 2026-09-01 caught the
// difference in real output: JAI said there is an 8:30pm class "on Tue, Wed, Thu
// and Fri". 8:30pm is a real time on Tue/Thu/Fri, so token validation passed it —
// but Wednesday's last class ends at 8:30pm, and a lead following that turns up
// to a closing gym. It also merged "4:30-5:15pm Kids · 5:15-6:00pm Pre-Teen"
// into "4:30-6:00pm"; both endpoints are real, so the merged span passed too.
//
// So we also index the schedule PER DAY, and as whole ranges rather than loose
// endpoints, then verify every (day, time) the reply actually asserts.
const DAY_NAMES: Record<string, string> = {
  mon: "mon", monday: "mon", tue: "tue", tues: "tue", tuesday: "tue",
  wed: "wed", weds: "wed", wednesday: "wed", thu: "thu", thur: "thu",
  thurs: "thu", thursday: "thu", fri: "fri", friday: "fri", sat: "sat",
  saturday: "sat", sun: "sun", sunday: "sun",
};
// The trailing "s?" is load-bearing: without it "Wednesdays" matched nothing,
// daysIn() returned empty, and the whole segment skipped the day check. The
// live model writes plurals unprompted, so every "on Wednesdays" claim was
// going unchecked.
const DAY_WORD_RE = new RegExp(`\\b(${Object.keys(DAY_NAMES).join("|")})s?\\b`, "gi");
// "Mon-Fri", "Monday to Saturday" — too coarse to bind a specific time to, so a
// segment containing one is skipped rather than guessed at.
const DAY_RANGE_RE = new RegExp(
  `\\b(${Object.keys(DAY_NAMES).join("|")})\\b[ \\t]*(?:[-–—]|to)[ \\t]*\\b(${Object.keys(DAY_NAMES).join("|")})\\b`,
  "i"
);

// A day plus a time only constrains the timetable when the sentence is talking
// about classes at all.
const CLASS_CONTEXT_RE =
  /\b(class|classes|session|sessions|train|training|timetable|schedule|runs?|start|starts|kids|pre-?teen|advanced|sparring|all[- ]levels|open|slot)\b/i;

/** Runs of day names joined only by list punctuation — "Tue & Thu", "Tue, Wed and Fri". */
function dayGroups(seg: string): { days: string[]; start: number; end: number }[] {
  const hits: { day: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  DAY_WORD_RE.lastIndex = 0;
  while ((m = DAY_WORD_RE.exec(seg)) !== null) {
    const day = DAY_NAMES[m[1].toLowerCase()];
    if (day) hits.push({ day, start: m.index, end: m.index + m[0].length });
  }
  const groups: { days: string[]; start: number; end: number }[] = [];
  for (const h of hits) {
    const prev = groups[groups.length - 1];
    if (prev && /^[\s,/&]*(and|or|\+)?[\s,/&]*$/i.test(seg.slice(prev.end, h.start))) {
      prev.days.push(h.day);
      prev.end = h.end;
    } else {
      groups.push({ days: [h.day], start: h.start, end: h.end });
    }
  }
  return groups;
}

export type DaySchedule = Map<string, { starts: Set<string>; ends: Set<string>; ranges: Set<string> }>;

/** Parse the "=== CLASS SCHEDULE ... ===" block into day -> allowed times/ranges. */
export function indexSchedule(facts: string): DaySchedule {
  const out: DaySchedule = new Map();
  // NB: the header itself can contain '=' ("AL = All Levels"), so match to the
  // end of the header LINE rather than excluding '=' characters.
  const sec = /===[^\n]*SCHEDULE[^\n]*===[ \t]*\n([\s\S]*?)(?:\n===|$)/i.exec(facts);
  if (!sec) return out;
  for (const line of sec[1].split("\n")) {
    const m = /^[-*\u2022]?[ \t]*([A-Za-z]{3,9})[ \t]*:[ \t]*(.+)$/.exec(line.trim());
    if (!m) continue;
    const day = DAY_NAMES[m[1].toLowerCase()];
    if (!day) continue;
    const entry = out.get(day) || { starts: new Set<string>(), ends: new Set<string>(), ranges: new Set<string>() };
    // Ranges as UNITS (so a merged span is not reconstructable from two halves).
    const toks = extractTimes(m[2]);
    for (let i = 0; i + 1 < toks.length; i += 2) {
      entry.ranges.add(`${toks[i].norm}-${toks[i + 1].norm}`);
      entry.starts.add(toks[i].norm);
      entry.ends.add(toks[i + 1].norm);
    }
    out.set(day, entry);
  }
  return out;
}


/**
 * Every (day, time) the reply asserts must hold for EVERY day named in that
 * segment — "8:30pm on Tue, Wed, Thu and Fri" is a claim about each of them.
 * Segments that negate, or that use a day RANGE, are skipped: the first is the
 * assistant correcting the customer, the second is too coarse to bind.
 */
export function checkDayBinding(reply: string, sched: DaySchedule): Token[] {
  const bad: Token[] = [];
  if (sched.size === 0) return bad;
  // Contrastive conjunctions start a new clause and a new subject: in "On
  // weekdays we start at 7am but Saturday starts at 10am" the 7am belongs to the
  // unnamed weekdays, not to the Saturday that follows it. Without this split
  // the nearest-day rule bound 7am to Saturday and blocked a correct reply.
  for (const seg of reply.split(/[.!?;\n]|\u00b7|\b(?:but|whereas|although|though)\b/i)) {
    if (!seg || !seg.trim() || TRUE_NEGATION_RE.test(seg) || DAY_RANGE_RE.test(seg)) continue;
    // Only bind times when the sentence is actually about classes. "I'll get
    // Coach Jeremy to call you Monday around 6pm" names a day and a time but
    // asserts nothing about the timetable, and blocking it would escalate a
    // perfectly good reply.
    if (!CLASS_CONTEXT_RE.test(seg)) continue;
    const groups = dayGroups(seg);
    if (groups.length === 0) continue;
    const { ranges, singles } = extractTimeParts(seg);
    if (ranges.length === 0 && singles.length === 0) continue;
    const endsCue = /\b(end|ends|ending|finish|finishes|finishing|until|till|til|through)\b/i.test(seg);

    // Bind each time to the NEAREST group of day names, not to every day in the
    // sentence. "Kids are Tue & Thu 4:30-5:15pm, and Sat 10:00-10:45am" is one
    // segment naming three days; the cross-product asserted 10am on Tuesday and
    // 4:30pm on Saturday and blocked a factually perfect reply. Twice, on real
    // model output.
    // Beyond this many characters the association is a guess, not a claim.
    // "On weekdays we start at 7am but Saturday starts at 10am" names only
    // Saturday, and 7am belongs to the unnamed "weekdays" — binding it to the
    // far-away Saturday blocked a correct reply.
    const MAX_BIND_DISTANCE = 40;
    const bind = (at: number): string[] => {
      if (at < 0) return [];
      let best: { days: string[]; start: number; end: number } | null = null;
      let bestDist = Infinity;
      for (const g of groups) {
        const d = at < g.start ? g.start - at : at > g.end ? at - g.end : 0;
        if (d < bestDist) { bestDist = d; best = g; }
      }
      return best && bestDist <= MAX_BIND_DISTANCE ? best.days : [];
    };
    // A day the sheet lists with no classes (Sunday: "no group classes, PT
    // only"). A PT time on that day is legitimate and unlisted; a GROUP CLASS
    // on it is a fabrication.
    const ptContext = /\b(pt|personal training|one[- ]to[- ]one|1[- ]to[- ]1|private|appointment|arrange)\b/i.test(seg);

    for (const r of ranges) {
      for (const d of bind(r.at)) {
        const e = sched.get(d);
        if (!e) continue;
        if (e.ranges.size === 0) {
          if (!ptContext) bad.push({ raw: `${r.start.raw}-${r.end.raw} on ${d}`, norm: `${r.start.norm}-${r.end.norm}@${d}` });
          continue;
        }
        const span = `${r.start.norm}-${r.end.norm}`;
        if (!e.ranges.has(span)) {
          bad.push({ raw: `${r.start.raw}-${r.end.raw} on ${d}`, norm: `${span}@${d}` });
        }
      }
    }
    for (const t of singles) {
      for (const d of bind(t.at)) {
        const e = sched.get(d);
        if (!e) continue;
        if (e.ranges.size === 0) {
          if (!ptContext) bad.push({ raw: `${t.raw} on ${d}`, norm: `${t.norm}@${d}` });
          continue;
        }
        if (e.starts.has(t.norm)) continue;
        if (endsCue && e.ends.has(t.norm)) continue;
        bad.push({ raw: `${t.raw} on ${d}`, norm: `${t.norm}@${d}` });
      }
    }
  }
  return bad;
}

// ── schedule-claim detection (the whitelist inversion) ──────────────────────
// Three rounds of e2e taught the same lesson: enumerating the ways a reply can
// be wrong is a blacklist, and a blacklist over natural language never
// converges. Each round closed one phrasing and the next round found another,
// and none of it covered Chinese or Malay — which the fact sheet explicitly
// tells JAI to reply in.
//
// So stop grading timetable claims and stop letting the model make them. If a
// draft states a day and a time, the caller replaces the whole reply with an
// answer built from the sheet. Detection can be deliberately greedy here: a
// false trigger costs a correct-but-differently-worded answer, not a customer
// deflected to "let me check with Coach Jeremy".
const DAY_WORDS_MULTILINGUAL = [
  // English (plurals and possessives handled by the s? and 's? below)
  "mon", "monday", "tue", "tues", "tuesday", "wed", "weds", "wednesday",
  "thu", "thur", "thurs", "thursday", "fri", "friday", "sat", "saturday",
  "sun", "sunday", "weekday", "weekend", "today", "tomorrow", "tonight",
  // Bahasa Melayu
  "isnin", "selasa", "rabu", "khamis", "jumaat", "sabtu", "ahad", "minggu",
  "hari",
];
const DAY_WORD_ANY_RE = new RegExp(
  `(\\b(${DAY_WORDS_MULTILINGUAL.join("|")})('?s)?\\b|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|週[一二三四五六日天])`,
  "i"
);
// Chinese states times as 晚上7点半 / 7點 / 下午4:30 — the latin-digit forms are
// caught by the shared time regex, so only the CJK hour marker is added here.
const CJK_TIME_RE = /\d{1,2}\s*[:：.]?\s*\d{0,2}\s*[点點]/;
// The day side of this detector was multilingual from the start; the TIME side
// was am/pm only, and I claimed the language bypass was closed when it was not.
// A live DeepSeek reply in Malay wrote "7:00–8:00 pagi … 6:30–7:30 petang" and
// walked straight past. The 19-case suite missed it because every non-English
// case in it happened to write the time in English format.
const MS_TIME_RE = /\d{1,2}([:.]\d{2})?\s*(pagi|petang|malam|tengah\s*hari)/i;
// Bare clock times with no meridiem at all: "7:00-8:00", "19:30".
const BARE_CLOCK_RE = /\b\d{1,2}[:.]\d{2}\b/;

/**
 * Does this draft assert a class time? Day word + any time, in any of the three
 * languages JAI replies in. Greedy by design — see the note above.
 */
export function statesAClassTime(reply: string): boolean {
  const hasDay = DAY_WORD_ANY_RE.test(reply);
  if (!hasDay) return false;
  return (
    extractTimes(reply).length > 0 ||
    CJK_TIME_RE.test(reply) ||
    MS_TIME_RE.test(reply) ||
    BARE_CLOCK_RE.test(reply)
  );
}

/** The canonical days named anywhere in a piece of text, sheet-label style. */
export function daysNamedIn(text: string): string[] {
  const map: Record<string, string> = {
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
  };
  const zh: Record<string, string> = {
    "一": "Mon", "二": "Tue", "三": "Wed", "四": "Thu", "五": "Fri", "六": "Sat", "日": "Sun", "天": "Sun",
  };
  const ms: Record<string, string> = {
    isnin: "Mon", selasa: "Tue", rabu: "Wed", khamis: "Thu", jumaat: "Fri", sabtu: "Sat", ahad: "Sun",
  };
  const out = new Set<string>();
  // exec loops rather than matchAll — the project's TS target predates
  // downlevelIteration, so a RegExpStringIterator cannot be spread here.
  const scan = (re: RegExp, pick: (m: RegExpExecArray) => string | undefined) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const v = pick(m);
      if (v) out.add(v);
    }
  };
  scan(/\b(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)[a-z]*\b/gi,
       (m) => map[m[1].toLowerCase().slice(0, 3)]);
  scan(/[周星期礼拜週]([一二三四五六日天])/g, (m) => zh[m[1]]);
  scan(/\b(isnin|selasa|rabu|khamis|jumaat|sabtu|ahad)\b/gi, (m) => ms[m[1].toLowerCase()]);
  return Array.from(out);
}

/** Does this text look like it is NOT in English? Used to avoid answering a
 *  Chinese or Malay customer with English canned copy. */
export function looksNonEnglish(text: string): boolean {
  if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(text)) return true;
  const ms = /\b(kelas|hari|pukul|boleh|nak|saya|ada|berapa|jadual|petang|pagi|malam|esok)\b/i;
  return ms.test(text);
}

// ── sheet index (memoised — the sheet is a module constant in practice) ─────
type SheetIndex = { times: Set<string>; prices: Set<string>; links: Set<string> };
let cachedSheet: string | null = null;
let cachedIndex: SheetIndex | null = null;

// A fact sheet does not only assert facts — it also FORBIDS things, and it
// quotes the very mistakes it is trying to prevent. JMT's sheet literally says
// "There is no 7pm class on any day" and quotes the bad 2026-07-20 reply
// verbatim. Extracting tokens naively made that prohibition the thing that
// authorised "7pm" — the sentence written to stop the bug was what let it
// through, and the guard passed the exact reply it exists to block.
//
// So a token counts as ALLOWED only if it appears at least once OUTSIDE a
// forbidding sentence. A token that only ever appears inside one is being
// named to be ruled out, never to be stated.
const NEGATIVE_SEGMENT =
  /\b(no|not|never|non|isn'?t|aren'?t|don'?t|doesn'?t|cannot|can'?t|dead|switched off|paused|wrong|instead of|rather than|do NOT)\b/i;

// Quoted spans are illustrations, not assertions. The sheet quotes the exact
// bad reply it is warning about — «"All-Levels classes at 7pm and 7:30pm" — the
// schedule was correct, you rewrote it» — and that sentence carries no negation
// word, so filtering on negation alone still let "7pm" through. Anything a
// human put in quotation marks here is an example (a model reply template, a
// customer phrase, a past mistake), never the source of truth.
//
// Both filters are subtractive and a token only needs ONE clean appearance, so
// a real fact quoted inside a template is still allowed via its plain mention
// in the schedule or price list.
function stripQuoted(text: string): string {
  return text.replace(/"[^"]*"|\u201c[^\u201d]*\u201d/g, " ");
}

function positiveSegments(facts: string): string {
  return stripQuoted(facts)
    .split(/\n|(?<=\.)\s+/)
    .filter((seg) => !NEGATIVE_SEGMENT.test(seg))
    .join("\n");
}

export function indexFacts(facts: string): SheetIndex {
  if (cachedSheet === facts && cachedIndex) return cachedIndex;
  const positive = positiveSegments(facts);
  const idx: SheetIndex = {
    times: new Set(extractTimes(positive).map((t) => t.norm)),
    prices: new Set(extractPrices(positive).map((t) => t.norm)),
    links: new Set(extractLinks(positive).map((t) => t.norm)),
  };
  cachedSheet = facts;
  cachedIndex = idx;
  return idx;
}

// A token the CUSTOMER wrote may be echoed back when the sentence is correcting
// them ("we don't have a 7pm class — closest is 6:30pm"). Without this the
// guard blocks the single most useful reply the assistant can send.
function echoedCorrection(
  reply: string,
  raw: string,
  customerNorms: Set<string>,
  norm: string,
  cues: string[]
): boolean {
  if (!customerNorms.has(norm)) return false;
  const at = reply.indexOf(raw);
  if (at === -1) return false;
  const start = Math.max(0, reply.lastIndexOf(".", at) + 1);
  const endDot = reply.indexOf(".", at);
  const sentence = reply.slice(start, endDot === -1 ? reply.length : endDot).toLowerCase();
  return cues.some((c) => sentence.includes(c.toLowerCase()));
}

export type ValidateOptions = {
  /** The customer's own message, so an echoed-and-corrected value isn't blocked. */
  customerText?: string;
  config?: FactGuardConfig;
};

/**
 * Check a draft reply against the fact sheet. NEVER throws — on an internal
 * error it returns ok:true with `error` set (fail open, loudly).
 */
export function validateReply(
  reply: string,
  facts: string,
  opts: ValidateOptions = {}
): FactCheckResult {
  try {
    const config = opts.config || DEFAULT_FACT_GUARD_CONFIG;
    const idx = indexFacts(facts);
    const customer = opts.customerText || "";
    const custTimes = new Set(extractTimes(customer).map((t) => t.norm));
    const custPrices = new Set(extractPrices(customer).map((t) => t.norm));
    const violations: Violation[] = [];
    const seen = new Set<string>();
    const add = (kind: ViolationKind, t: Token) => {
      const key = `${kind}:${t.norm}`;
      if (seen.has(key)) return;
      seen.add(key);
      violations.push({ kind, token: t.raw, normalised: t.norm });
    };

    // The sheet side already ignores forbidding sentences; the reply side must
    // too. "There is no 8pm class on Mondays" does not assert that 8pm exists,
    // and blocking it would escalate the single most useful correction JAI can
    // send — the one that stops a lead turning up at the wrong time.
    const negatedSegment = (token: string): boolean =>
      reply
        .split(/[.!?;\n]/)
        .some((seg) => seg.includes(token) && TRUE_NEGATION_RE.test(seg));

    for (const t of extractTimes(reply)) {
      if (idx.times.has(t.norm)) continue;
      if (echoedCorrection(reply, t.raw, custTimes, t.norm, config.negationCues)) continue;
      if (negatedSegment(t.raw)) continue;
      add("time", t);
    }
    // Day binding — a real time asserted on the wrong day (see indexSchedule).
    for (const d of checkDayBinding(reply, indexSchedule(facts))) {
      add("day", d);
    }
    for (const p of extractPrices(reply)) {
      if (idx.prices.has(p.norm)) continue;
      if (echoedCorrection(reply, p.raw, custPrices, p.norm, config.negationCues)) continue;
      add("price", p);
    }
    for (const l of extractLinks(reply)) {
      if (idx.links.has(l.norm)) continue;
      if (linkAllowed(l.norm, config.allowedRuntimeLinks)) continue;
      add("link", l);
    }

    return { ok: violations.length === 0, violations };
  } catch (err) {
    console.error("[fact-guard] validator error — failing OPEN", err);
    return { ok: true, violations: [], error: String(err) };
  }
}

/** One-line, human-readable list of what was wrong — for the retry + the log. */
export function describeViolations(v: Violation[]): string {
  return v.map((x) => `${x.kind} "${x.token}"`).join(", ");
}

// ── TENANT CONFIG — the only JMT-specific values in this file ───────────────
export const JMT_FACT_GUARD_CONFIG: FactGuardConfig = {
  ...DEFAULT_FACT_GUARD_CONFIG,
  allowedRuntimeLinks: [
    // WhatsApp deep links to the gym's OWN number. The number itself is in the
    // fact sheet (+65 9238 3071) but the URL form is built by WhatsApp at
    // runtime, so it can never appear in the sheet text.
    "wa.me",
    "api.whatsapp.com/send",
  ],
};
