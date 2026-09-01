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
  const last = prior.length ? new Date(prior[prior.length - 1].created_at ?? "").getTime() : NaN;
  if (Number.isFinite(last) && now - last >= gapMs) return 0;
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
