/**
 * How many replies JAI has already sent IN THIS CONVERSATION.
 *
 * The anti-loop guard hands a chat to Coach Jeremy once JAI has sent 8 replies.
 * That count used to run for all time, so a returning customer was permanently
 * handed off — on 1 Sep, 17 of 96 contacts were past the threshold and JAI had
 * silently stopped answering every one of them, including a lead asking prices.
 *
 * A conversation ends at the first gap of `gapMs` (6h by default). Messages must
 * arrive oldest-first. A row with an unparseable timestamp never opens a gap.
 *
 * The gap between the LAST stored message and now counts too. Miss that and a
 * customer whose whole history is from weeks ago still looks like one long
 * sitting, because every gap inside the array is small — which is exactly what
 * the first version of this function did, and the unit test did not catch it
 * because its fixture put the gap in the middle of the array instead of at the
 * end. scripts/jai-conversation-check.mjs caught it.
 */
export function sessionBotReplyCount(
  prior: { role: string; created_at?: string | null }[],
  gapMs = 6 * 60 * 60 * 1000,
  now = Date.now()
): number {
  // created_at is nullable, and Postgres orders DESC as NULLS FIRST — so a null
  // row comes back first and lands LAST here after the reverse. If we cannot
  // read the newest timestamp we must not conclude "still mid-conversation":
  // that is precisely how a customer stays handed off forever. Unknown means
  // treat it as a fresh conversation — the guard still fires on a real sitting,
  // because that needs 8 replies with readable timestamps.
  const last = prior.length ? new Date(prior[prior.length - 1].created_at ?? "").getTime() : NaN;
  if (!prior.length || !Number.isFinite(last) || now - last >= gapMs) return 0;
  let start = 0;
  for (let i = prior.length - 1; i > 0; i--) {
    const t = new Date(prior[i].created_at ?? "").getTime();
    const tPrev = new Date(prior[i - 1].created_at ?? "").getTime();
    if (Number.isFinite(t) && Number.isFinite(tPrev) && t - tPrev >= gapMs) {
      start = i;
      break;
    }
  }
  return prior.slice(start).filter((m) => m.role === "assistant").length;
}

/**
 * Is JAI repeating itself — i.e. are its last two real replies the same message?
 *
 * `priorBot` is every bot message in the thread, oldest-first. The anti-loop
 * handoff line is NOT a real reply: it is this guard's own output, and counting
 * it made the guard latch. Pass it as `handoffText` so it can be discounted.
 *
 * 🛑 Two separate mistakes live in this one decision, both of which reached
 * customers. Keep both in mind before changing it.
 *
 * 1. The first version counted the handoff as a reply, so once the guard had
 *    fired twice JAI's last two messages were both the handoff, "repeating
 *    itself" was true forever, and every later question got the deflection.
 *    Isaac watched it happen three times in a row (2 Sep 2026).
 * 2. The fix for that filtered the handoff OUT of the comparison — which looks
 *    right and is not. Filtering means the genuine duplicate pair that tripped
 *    the guard stays the newest two non-handoff messages for the rest of the
 *    conversation, so `repeating` is STILL true forever; only the shape of the
 *    bug changed. Five brand-new answerable questions each got the deflection.
 *    (Found 12 Sep 2026 by /predeploy.)
 *
 * So: if the NEWEST bot message is the handoff, the guard has already fired for
 * this repetition and we report false. One handoff per repetition, not one per
 * turn. A genuinely stuck chat still reaches a human via the caller's hard
 * ceiling on session reply count.
 */
export function isRepeatingItself(priorBot: string[], handoffText: string): boolean {
  const norm = (m: string) => m.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim().slice(0, 80);
  const own = norm(handoffText);
  const normalised = priorBot.map(norm).filter((m) => m.length > 0);
  if (normalised.length === 0) return false;
  // The guard has already spoken — do not fire again off the same repetition.
  if (normalised[normalised.length - 1] === own) return false;
  const lastTwo = [...normalised].reverse().filter((m) => m !== own).slice(0, 2);
  return lastTwo.length === 2 && lastTwo[0] === lastTwo[1];
}
