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

// ── Message drafts ───────────────────────────────────────────────────────────
// DRAFTS — written 2026-09-02, NOT approved. Isaac signs off anything a
// customer reads. Both are deliberately safe for someone who has already booked
// on the website: nothing in this database records a drop-in purchase, so the
// cron cannot know.

export function dropinNudge1(first: string): string {
  return (
    `Hey${first ? ` ${first}` : ""}! Still keen to jump in? 🥊\n\n` +
    `A drop-in class is $42 — same class, same coaches, beginners welcome. ` +
    `Takes a minute to book: ${DROPIN_BOOKING_URL}\n\n` +
    `Rather ask me something first? Just reply here.`
  );
}

export function dropinNudge2(first: string): string {
  return (
    `Last check${first ? `, ${first}` : ""} — want to come try a class this week? 🙂\n\n` +
    `The $42 drop-in is here whenever you're ready: ${DROPIN_BOOKING_URL}\n\n` +
    `Already booked? Ignore this and see you at the gym 🙏 If now's not the right time, no stress at all.`
  );
}
