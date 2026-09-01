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
  ranges: { start: Token; end: Token }[];
  singles: Token[];
} {
  const ranges: { start: Token; end: Token }[] = [];
  const masked = text.replace(TIME_RANGE_RE, (full: string) => {
    const both = extractTimes(full);
    if (both.length === 2) ranges.push({ start: both[0], end: both[1] });
    return " ".repeat(full.length);
  });
  return { ranges, singles: extractTimes(masked) };
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
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_WORD_RE = new RegExp(`\\b(${Object.keys(DAY_NAMES).join("|")})\\b`, "gi");
// "Mon-Fri", "Monday to Saturday" — too coarse to bind a specific time to, so a
// segment containing one is skipped rather than guessed at.
const DAY_RANGE_RE = new RegExp(
  `\\b(${Object.keys(DAY_NAMES).join("|")})\\b[ \\t]*(?:[-–—]|to)[ \\t]*\\b(${Object.keys(DAY_NAMES).join("|")})\\b`,
  "i"
);

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

function daysIn(seg: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  DAY_WORD_RE.lastIndex = 0;
  while ((m = DAY_WORD_RE.exec(seg)) !== null) found.add(DAY_NAMES[m[1].toLowerCase()]);
  return DAY_ORDER.filter((d) => found.has(d));
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
  for (const seg of reply.split(/[.!?;\n]|\u00b7/)) {
    if (!seg.trim() || TRUE_NEGATION_RE.test(seg) || DAY_RANGE_RE.test(seg)) continue;
    const days = daysIn(seg);
    if (days.length === 0) continue;
    const { ranges, singles } = extractTimeParts(seg);
    if (ranges.length === 0 && singles.length === 0) continue;
    // Ranges as UNITS — a merged span fails here even though its halves are real.
    for (const r of ranges) {
      const span = `${r.start.norm}-${r.end.norm}`;
      for (const d of days) {
        const e = sched.get(d);
        if (e && !e.ranges.has(span)) {
          bad.push({ raw: `${r.start.raw}-${r.end.raw} on ${d}`, norm: `${span}@${d}` });
        }
      }
    }
    // A class "at 8:30pm" must START at 8:30pm. On Wednesday 8:30pm is only ever
    // the END of the 7:30pm class, which is exactly how the live model produced a
    // Wednesday class that does not exist. An end time is therefore accepted only
    // when the sentence is actually talking about an ending.
    const endsCue = /\b(end|ends|ending|finish|finishes|finishing|until|till|til|through)\b/i.test(seg);
    for (const t of singles) {
      for (const d of days) {
        const e = sched.get(d);
        if (!e) continue;
        if (e.starts.has(t.norm)) continue;
        if (endsCue && e.ends.has(t.norm)) continue;
        bad.push({ raw: `${t.raw} on ${d}`, norm: `${t.norm}@${d}` });
      }
    }
  }
  return bad;
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
