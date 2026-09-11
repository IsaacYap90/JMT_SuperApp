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
  now: number = Date.now()
): Promise<boolean> {
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
  if (!last) return true; // no human has EVER replied here → nobody is on it
  const ts = new Date(last).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts >= PAUSE_STALE_MS;
}
