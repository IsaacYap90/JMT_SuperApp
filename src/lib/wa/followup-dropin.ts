// Drop-in follow-up — the decision half, kept pure so it can be reasoned about
// (and tested) without a database or a WhatsApp send.
//
// Background (2026-09-02): the old nudge sequence was armed by the webhook only
// when the bot's reply contained a calendly.com link, and its nudge-1 fallback
// pointed at the adult free-trial Calendly event. That event was switched off on
// 30 July, the cron was unscheduled the same week, and since then a lead who is
// sent the $42 drop-in link and does not book is never messaged again.
//
// This rebuild arms off the drop-in link itself, read straight from the
// conversation history — so it needs no change to the webhook and cannot be
// silently disarmed by a link that is no longer sent.

/** The one booking URL the bot sends adults. Arming looks for this string. */
export const DROPIN_BOOKING_URL = "https://jaimuaythai.com/booking";

/**
 * `jai.conversations.via` value the follow-up cron stamps on its own mirror
 * rows (JAI's replies are 'bot', the WA inbox is 'human'). Distinct on purpose:
 * nudge 1 contains DROPIN_BOOKING_URL and both nudges are assistant rows, so a
 * mirror stamped 'bot' re-armed the cron off its own message (2026-09-11).
 * Anything that classifies assistant rows by `via` must know this value — see
 * pause-stale.ts (not a human) and activity-feed.tsx (still "JAI replied").
 */
export const FOLLOWUP_VIA = "followup";

const H = 3600e3;

/** Nudge 1 is due this long after the booking link went out. */
export const NUDGE1_AFTER_H = 1;
/**
 * Nudge 2 is due this long after the link — NOT 24h.
 *
 * Meta's customer-service window is measured from the customer's last INBOUND
 * message, and for a silent lead that is (within seconds of) the link send. A
 * freeform nudge at exactly +24h therefore lands on or after the boundary and
 * is rejected; sendText() swallows that into a console.error and returns false,
 * so the caller would report a send that never happened. 22h keeps a 2h margin
 * for cron jitter and the quiet-hours hold. A true +24h nudge needs an approved
 * template — see the report/README note, not this constant.
 */
export const NUDGE2_AFTER_H = 22;
/** …and never closer than this to nudge 1 (quiet hours can bunch them up). */
export const NUDGE2_GAP_H = 8;
/** Freeform is only attempted while the last inbound is younger than this. */
export const WINDOW_H = 23;
/** Past this much time with nudge 2 still unsent, stop trying — go cold. */
export const GIVE_UP_H = 30;

export type NudgeDecision =
  | { stage: "wait"; reason: string }
  | { stage: "nudge1" }
  | { stage: "nudge2" }
  | { stage: "cold"; reason: string }
  | { stage: "done"; reason: string };

export type NudgeInput = {
  now: number;
  /** When the drop-in booking link was last sent to this lead. */
  linkAt: number;
  /** Their most recent inbound message (0 if none). Drives the 24h window. */
  lastUserAt: number;
  /** silent_nudge1_sent_at, ms (null if never). */
  nudge1At: number | null;
  /** silent_nudge2_sent_at, ms (null if never). */
  nudge2At: number | null;
};

/**
 * Two nudges per booking-link send, ever, then silence.
 *
 * A stamp OLDER than the link belongs to a previous arming — a lead who comes
 * back weeks later and is sent the link again starts a fresh pair. That is the
 * whole re-arm mechanism: no extra column, no clearing, and a replayed cron run
 * lands on "done" rather than sending twice.
 */
export function decideNudge(i: NudgeInput): NudgeDecision {
  if (i.lastUserAt > i.linkAt) {
    return { stage: "done", reason: "replied since the link" };
  }
  const n1 = i.nudge1At && i.nudge1At >= i.linkAt ? i.nudge1At : null;
  const n2 = i.nudge2At && i.nudge2At >= i.linkAt ? i.nudge2At : null;
  if (n2) return { stage: "done", reason: "sequence finished" };

  const windowOpen = i.lastUserAt > 0 && i.now - i.lastUserAt < WINDOW_H * H;

  if (!n1) {
    if (i.now - i.linkAt < NUDGE1_AFTER_H * H) return { stage: "wait", reason: "nudge 1 not due" };
    if (!windowOpen) return { stage: "cold", reason: "24h window shut before nudge 1" };
    return { stage: "nudge1" };
  }

  const due = Math.max(i.linkAt + NUDGE2_AFTER_H * H, n1 + NUDGE2_GAP_H * H);
  if (i.now < due) {
    if (i.now - i.linkAt >= GIVE_UP_H * H) return { stage: "cold", reason: "too late for nudge 2" };
    return { stage: "wait", reason: "nudge 2 not due" };
  }
  if (!windowOpen) return { stage: "cold", reason: "24h window shut before nudge 2" };
  return { stage: "nudge2" };
}

import type { Lang } from "./lang";
import type { FollowupFacts } from "./followup-facts";

// ── Message drafts ───────────────────────────────────────────────────────────
// APPROVED by Isaac verbatim, 2026-09-02 ("4. use them."). Do not reword
// without asking him — these go out in his name. Written 2026-09-02.
//
// The "Already booked? Ignore this" line in nudge 2 is load-bearing, not
// politeness: public.bookings and public.payments are EMPTY, drop-in purchases
// happen on the marketing site and never reach this database, so we cannot tell
// whether the person already paid. Until a webhook from the booking site exists,
// the message has to read sensibly to someone who has.
// (original note: DRAFTS — Isaac signs off anything a
// customer reads. Both are deliberately safe for someone who has already booked
// on the website: nothing in this database records a drop-in purchase, so the
// cron cannot know.
//
// ⚠ THE CHINESE DRAFTS BELOW ARE NOT YET SIGNED OFF (added 2026-09-16). The
// English wording above is Isaac's, approved verbatim, and is untouched. The
// fact sheet has ordered "Chinese in, Chinese out" since 25 Aug, but these four
// nudges never obeyed it: Vivi@n (+65 9697 3505) wrote eight Chinese messages
// and got both silent nudges in English on 15-16 Sep. Same shape as Huiling on
// 20 Aug, who opened with "你好", was answered in English, and never replied
// again — the incident the fact-sheet rule was written for.
// 🛑 Isaac signs off anything a customer reads. Get these approved before they
// go out, exactly as the English ones were.

export function dropinNudge1(first: string, lang: Lang = "en", facts?: FollowupFacts): string {
  if (lang === "zh") {
    return (
      `Hey${first ? ` ${first}` : ""}！还想来试试吗？🥊\n\n` +
      `单次 drop-in 是 $42 — 一样的课，一样的教练，新手也很欢迎。` +
      `一分钟就能预约：${DROPIN_BOOKING_URL}\n\n` +
      `想先问我什么也可以，直接回这里就好。`
    );
  }
  if (!facts) throw new Error("live follow-up facts are required for an English drop-in nudge");
  return (
    `Hey${first ? ` ${first}` : ""}! Still keen to jump in? 🥊\n\n` +
    `A drop-in class is ${facts.price} — same class, same coaches, beginners welcome. ` +
    `Takes a minute to book: ${facts.bookingUrl}\n\n` +
    `Rather ask me something first? Just reply here.`
  );
}

export function dropinNudge2(first: string, lang: Lang = "en", facts?: FollowupFacts): string {
  if (lang === "zh") {
    return (
      `最后问一次${first ? `，${first}` : ""} — 这个星期想来上一堂吗？🙂\n\n` +
      `$42 的 drop-in 随时都在，你准备好再来：${DROPIN_BOOKING_URL}\n\n` +
      `已经约了的话，忽略这则就好，拳馆见 🙏 如果现在时机不对，也完全没关系。`
    );
  }
  if (!facts) throw new Error("live follow-up facts are required for an English drop-in nudge");
  return (
    `Last check${first ? `, ${first}` : ""} — want to come try a class this week? 🙂\n\n` +
    `The ${facts.price} drop-in is here whenever you're ready: ${facts.bookingUrl}\n\n` +
    `Already booked? Ignore this and see you at the gym 🙏 If now's not the right time, no stress at all.`
  );
}

// ── Silent-answer nudges (added 2026-09-07) ─────────────────────────────────
// The arming above only ever finds people we sent the booking link to. On
// 7 Sep a parent asked whether her 15-year-old could join, got a genuinely good
// answer ending in "want me to check another day?", and was never messaged
// again — because JAI had answered rather than linked, so she was invisible to
// this cron. She is exactly the lead worth chasing.
//
// These two are for that case. They must NOT read like the drop-in nudges:
// "did you manage to book?" is nonsense to someone who was never sent a link.
// They reference the conversation, not a purchase, and both are safe for
// someone who has since decided against it.
export function silentNudge1(first: string, lang: Lang = "en"): string {
  if (lang === "zh") {
    return (
      `Hey${first ? ` ${first}` : ""} — 想确认一下，之前的回复有解答到你要问的吗？🙂\n\n` +
      `如果那个时间不合适，我可以帮你看别的日子或时段。`
    );
  }
  return (
    `Hey${first ? ` ${first}` : ""} — just checking that answered what you needed? 🙂\n\n` +
    `Happy to look up another day or time if that one doesn't suit.`
  );
}

export function silentNudge2(first: string, lang: Lang = "en"): string {
  if (lang === "zh") {
    return (
      `最后一则${first ? `，${first}` : ""} 🙏\n\n` +
      `如果你还想来试一堂，告诉我哪天方便，我帮你安排。` +
      `如果现在时机不对，也完全没关系 — 我们随时都在。`
    );
  }
  return (
    `Last one from me${first ? `, ${first}` : ""} 🙏\n\n` +
    `If you'd still like to come try a class, just tell me which day works and I'll sort it. ` +
    `If the timing isn't right, no stress at all — we're here when you are.`
  );
}
