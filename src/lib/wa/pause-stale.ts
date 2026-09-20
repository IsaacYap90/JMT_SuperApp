// Auto-resume for a stale `jai.leads.ai_paused` (Isaac, 2026-09-02).
//
// ai_paused is set two ways — Jeremy taking a chat over from the WA inbox, and
// the promo/price handoff in the webhook — and NOTHING has ever cleared it. As
// of 2026-09-02 that left 28 of 83 lead rows muted for good: JAI logs their
// message and returns without replying, so the warmest leads in the pipeline
// get silence unless Jeremy happens to open the inbox.
//
// The rule Isaac chose: a pause is a HANDOFF, not a mute. If no human has
// replied in that thread for 24 hours, Jeremy is clearly not on it — the lead
// is still warm, so JAI takes it back. If he replied inside 24h he owns it and
// JAI stays quiet.
import type { createJaiClient } from "@/lib/supabase/jai";
import { FOLLOWUP_VIA } from "@/lib/wa/followup-dropin";

// The `jai`-schema service client (conversations + leads live there), typed off
// its factory so this file does not have to restate the schema generic.
type JaiClient = ReturnType<typeof createJaiClient>;

export const PAUSE_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * True when the pause on `contactNumber` is stale — i.e. no HUMAN assistant
 * message in the thread within PAUSE_STALE_MS.
 *
 * When NO human has ever replied in the thread, the clock falls back to the
 * newest assistant row of any `via` — the outbound reply the pause was written
 * beside — so a fresh pause is not instantly stale. See the comment inline.
 *
 * "Human" = an assistant row whose `via` is neither 'bot' nor FOLLOWUP_VIA.
 * JAI stamps via='bot' on every message it sends (webhook + trial-verify), the
 * lead-followup cron stamps its nudges FOLLOWUP_VIA (2026-09-11 — an automated
 * nudge is not Jeremy), the WA inbox stamps via='human'; verified against live
 * data 2026-09-02 (381 'bot', 102 'human', 3 assistant rows with via=NULL, all
 * from 2026-07-01 before the column existed). NULL is counted as HUMAN on
 * purpose — it is the conservative direction: an unknown sender keeps the chat
 * paused rather than unmuting one Jeremy is working.
 *
 * Fails CLOSED: any read error returns false (stay paused). Auto-resuming on a
 * DB hiccup would put JAI back in a conversation Jeremy is closing.
 */
export async function pauseIsStale(
  sb: JaiClient,
  contactNumber: string,
  now: number = Date.now(),
  notBefore?: string | null
): Promise<boolean> {
  // New pause rows have an explicit earliest auto-resume check. This prevents
  // a freshly paused old thread inheriting a month-old assistant timestamp and
  // resuming on the customer's very next message. Legacy rows omit it and keep
  // the conversation-derived behaviour below. Invalid metadata fails closed.
  if (notBefore) {
    const notBeforeTs = new Date(notBefore).getTime();
    if (!Number.isFinite(notBeforeTs)) return false;
    if (now < notBeforeTs) return false;
  }

  // jai.leads.last_contact is stale on every row — never use it. The only
  // trustworthy clock is jai.conversations.created_at.
  const { data, error } = await sb
    .from("conversations")
    .select("created_at")
    .eq("contact_number", contactNumber)
    .eq("role", "assistant")
    .or(`via.is.null,via.not.in.(bot,${FOLLOWUP_VIA})`)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) {
    console.error("[jai-webhook] pauseIsStale read failed, staying paused", error);
    return false;
  }
  const last = data?.[0]?.created_at as string | undefined;
  if (last) {
    const ts = new Date(last).getTime();
    if (!Number.isFinite(ts)) return false;
    return now - ts >= PAUSE_STALE_MS;
  }

  // 🛑 No human row is NOT the same as 24h elapsed. This used to `return true`,
  // which made the pause stale the instant it was written: the promo/price-leak
  // handoff sets ai_paused, the customer replies 30 seconds later, and JAI
  // un-muted itself and answered — on exactly the threads the pause exists for,
  // because most of them have no human reply at all (102 human rows across the
  // whole table on 2026-09-02). The sheet's rule is that JAI must not be pressed
  // into guessing a figure while Jeremy is closing; that was not enforced.
  // (Found 12 Sep 2026.)
  //
  // The honest fallback clock is the pause's own age. There is no leads.paused_at
  // column, but the pause is always written alongside an outbound reply — the
  // escalating bot message, or the nudge — so the newest assistant row of ANY
  // `via` is when the handoff happened, i.e. how long Jeremy has had it.
  const { data: anyRow, error: anyErr } = await sb
    .from("conversations")
    .select("created_at")
    .eq("contact_number", contactNumber)
    .eq("role", "assistant")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (anyErr) {
    console.error("[jai-webhook] pauseIsStale fallback read failed, staying paused", anyErr);
    return false;
  }
  const since = anyRow?.[0]?.created_at as string | undefined;
  // No assistant row at all: we cannot date the pause, so we do not clear it.
  // Same direction as every other unknown in this file.
  if (!since) return false;
  const sinceTs = new Date(since).getTime();
  if (!Number.isFinite(sinceTs)) return false;
  return now - sinceTs >= PAUSE_STALE_MS;
}
