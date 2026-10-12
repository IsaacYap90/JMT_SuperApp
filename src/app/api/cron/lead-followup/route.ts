// Silent-lead follow-up — rebuilt 2026-09-02 for the $42 DROP-IN path.
//
// WHAT WAS BROKEN
// The previous version was bolted to the adult free-trial Calendly event:
//   • the webhook only armed the funnel when the bot's reply matched
//     /calendly\.com\//, so a lead sent the drop-in link was never armed;
//   • nudge 1 fell back to a hardcoded, now-dead Calendly URL;
//   • the route was removed from vercel.json on 2026-07-30, so none of it ran.
// Nothing has chased a silent lead since 27 July. 22 drop-in links have gone
// out since; 6 of those leads went quiet and were never messaged again.
//
// WHAT THIS DOES
// Arms off the drop-in booking link in the conversation history itself (no
// webhook change needed, and it cannot be disarmed by a link we stopped
// sending). Nudge 1 at +1h, nudge 2 at +22h — see NUDGE2_AFTER_H in
// followup-dropin.ts for why 22 and not 24 (Meta's customer-service window).
// Two nudges per link-send, ever, then silence.
//
// Idempotency: jai.leads.silent_nudge1_sent_at / silent_nudge2_sent_at. Those
// two columns existed but were never written by any code (0 rows) — the old
// funnel used followup1_sent_at / followup2_sent_at, which the webhook still
// clears on inbound. Keeping the pairs separate means this cron and the
// Calendly-era webhook logic cannot tread on each other. A stamp older than the
// link belongs to a previous arming, so a returning lead re-arms with no clear
// step and a double-run lands on "done" instead of sending twice.
//
// Safety: never nudge someone who replied after the link, is ai_paused (Jeremy
// has the chat), is a member, or has an upcoming trial booking. Never during
// quiet hours (21:00–09:00 SGT).
//
// Scheduled in vercel.json: { "path": "/api/cron/lead-followup", "schedule": "*/30 * * * *" }.
//
// ?dry=1 — plan the run and return it, sending nothing and writing nothing.
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createJaiClient } from "@/lib/supabase/jai";
import { firstNameFrom } from "@/lib/wa/jai-reply";
import { sendText } from "@/lib/wa/jai-send";
import { findBookingsByPhone } from "@/lib/wa/trial-verify";
import {
  FOLLOWUP_VIA,
  decideNudge,
  dropinNudge1,
  dropinNudge2,
  silentNudge1,
  silentNudge2,
} from "@/lib/wa/followup-dropin";
import { extractFollowupFacts } from "@/lib/wa/followup-facts";
import { readJaiFacts } from "@/lib/wa/jai-facts";
import { HANDOFF_MARKERS } from "@/lib/wa/join-intent";
import { detectLangFromHistory } from "@/lib/wa/lang";
import { evaluateFollowupEligibility } from "@/lib/wa/human-takeover";


export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Only links recent enough to still be inside the sequence. Nudge 2 is due at
// +22h and given up on at +30h, so three days is generous cover for a cron
// outage without dragging the whole history in.
const LOOKBACK_MS = 3 * 24 * 3600e3;

type Plan = {
  to: string;
  stage: string;
  reason?: string;
  sent?: boolean;
};

async function alertFactsFailure(reason: string) {
  const token = process.env.JMT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.WATCHDOG_TG_CHAT_ID;
  if (!token || !chatId) {
    console.error("[lead-followup] cannot alert facts failure: Telegram env vars missing");
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `JMT lead follow-up stopped: live JAI facts were unavailable or invalid. No customer nudges were sent. Reason: ${reason}`,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.error("[lead-followup] Telegram facts alert failed:", response.status);
  } catch (error) {
    console.error("[lead-followup] Telegram facts alert threw:", error);
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase env vars missing" }, { status: 500 });
  }
  if (!dry && !(process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN)) {
    return NextResponse.json({ error: "WA env vars missing" }, { status: 500 });
  }

  // Quiet hours: 21:00–09:00 SGT. A nudge due at 11pm goes out after 9am — or,
  // if that pushes it outside the 24h window, not at all (decideNudge → cold).
  const sg = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const hour = sg.getHours();
  if (hour < 9 || hour >= 21) {
    return NextResponse.json({ ok: true, skipped: "quiet hours" });
  }

  // Follow-ups are proactive customer messages, so unlike the reply path they
  // must never use the in-code fallback. Read once per run and stop before any
  // customer query/write/send if the live row is unavailable or malformed.
  const factsRead = await readJaiFacts();
  const extracted = extractFollowupFacts(factsRead.content);
  if (factsRead.source !== "db") {
    const reason = `live source unavailable (${factsRead.reason ?? "unknown reason"})`;
    console.error("[lead-followup] FACTS FAILED, sending nothing:", reason);
    if (!dry) await alertFactsFailure(reason);
    return NextResponse.json(
      { error: "live follow-up facts unavailable", source: factsRead.source, reason },
      { status: 503 }
    );
  }
  if (!extracted.ok) {
    console.error("[lead-followup] FACTS FAILED, sending nothing:", extracted.reason);
    if (!dry) await alertFactsFailure(extracted.reason);
    return NextResponse.json(
      { error: "live follow-up facts unavailable", source: factsRead.source, reason: extracted.reason },
      { status: 503 }
    );
  }
  const followupFacts = extracted.value;
  const dropinBookingUrl = followupFacts.bookingUrl;

  const jai = createJaiClient();
  const pub = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const now = Date.now();

  // Arm: the most recent drop-in booking link we sent each contact.
  //
  // Our own nudges are mirrored into this table (via=FOLLOWUP_VIA below) and
  // nudge 1 carries the booking URL, so without this exclusion the cron would
  // re-arm off its own message: the anchor slid to the nudge-1 send time, which
  // put nudge 2 due at +23h — the exact moment the 23h window shuts — so every
  // lead went cold after one message. Worse, ~50ms of DB-vs-Node clock skew
  // put the mirror row AFTER the nudge-1 stamp, so nudge 1 fired again every
  // run it was due (15 sends in a day, reproduced 2026-09-11).
  // 🛑 The error is READ, not dropped. Both this query and the answerRows one
  // below decide whether we have ALREADY dealt with a lead, so a failed read
  // that silently returns [] does not mean "nobody" — it means "we no longer
  // know", and the cron would then message customers it had already handled.
  // For this query specifically that re-opens the 15-sends-in-a-day bug the
  // comment above describes. Fail CLOSED: send nothing this run, say why, and
  // let the next run pick it up.
  const { data: linkRows, error: linkErr } = await jai
    .from("conversations")
    .select("contact_number, created_at, message")
    .eq("role", "assistant")
    .or(`via.is.null,via.neq.${FOLLOWUP_VIA}`)
    .ilike("message", `%${dropinBookingUrl}%`)
    .gte("created_at", new Date(now - LOOKBACK_MS).toISOString())
    .order("created_at", { ascending: false });
  if (linkErr) {
    console.error("[lead-followup] link-history read FAILED, sending nothing:", linkErr.code, linkErr.message);
    return NextResponse.json({ error: "link history unavailable", code: linkErr.code }, { status: 500 });
  }

  const linkAtByContact = new Map<string, number>();
  const anchorBodyByContact = new Map<string, string>();
  for (const r of linkRows || []) {
    // Rows arrive newest-first, so the first one per contact is the latest.
    if (!linkAtByContact.has(r.contact_number)) {
      linkAtByContact.set(r.contact_number, new Date(r.created_at).getTime());
      anchorBodyByContact.set(r.contact_number, String(r.message || ""));
    }
  }

  // ── Second source: answered, then silence (2026-09-07) ────────────────────
  // Arming on the booking link alone means we only ever chase people we tried
  // to sell to. A parent asked about her 15-year-old on 7 Sep, got a good
  // answer ending in a question, and was never followed up — she had no link,
  // so `numbers` was empty for her and the route returned before it even read
  // her lead row.
  //
  // So: also arm on JAI's most recent answer. The anchor is the same shape as
  // linkAt — the moment we last spoke and they went quiet — so decideNudge()
  // needs no change.
  //
  // Excluded on purpose:
  //   • messages carrying the booking link — the link source already owns those
  //     and its wording is the right one.
  //   • the join/price handoff lines — those mean Jeremy is taking it over, and
  //     escalation deliberately does NOT set ai_paused, so without this test we
  //     would nudge over the top of him.
  //   • our own mirrored nudges — `via` is FOLLOWUP_VIA, not 'bot', so the
  //     .eq below already leaves them out. Same re-arm bug as the link source.
  const { data: answerRows, error: answerErr } = await jai
    .from("conversations")
    .select("contact_number, created_at, message")
    .eq("role", "assistant")
    .eq("via", "bot")
    .gte("created_at", new Date(now - LOOKBACK_MS).toISOString())
    .order("created_at", { ascending: false });
  // Same reasoning as linkRows above: an empty result here reads as "nobody has
  // been answered", which would nudge every lead JAI already replied to.
  if (answerErr) {
    console.error("[lead-followup] answer-history read FAILED, sending nothing:", answerErr.code, answerErr.message);
    return NextResponse.json({ error: "answer history unavailable", code: answerErr.code }, { status: 500 });
  }

  const answerAtByContact = new Map<string, number>();
  for (const r of answerRows || []) {
    const to = r.contact_number as string;
    if (answerAtByContact.has(to) || linkAtByContact.has(to)) continue;
    const body = String(r.message ?? "");
    if (body.includes(dropinBookingUrl)) continue;
    if (HANDOFF_MARKERS.some((m) => body.includes(m))) continue;
    answerAtByContact.set(to, new Date(r.created_at).getTime());
    anchorBodyByContact.set(to, body);
  }

  // One map, one loop. `armedBy` only decides which wording is used; every
  // guard below — member, ai_paused, replied-since, already booked, the 22h
  // window — applies identically to both sources.
  const armAtByContact = new Map(linkAtByContact);
  // forEach, not for-of: this repo's tsconfig target predates Map iteration.
  answerAtByContact.forEach((v, k) => armAtByContact.set(k, v));
  const armedBy = (to: string) => (linkAtByContact.has(to) ? "link" : "silent");

  const numbers = Array.from(armAtByContact.keys());
  if (numbers.length === 0) {
    return NextResponse.json({ ok: true, dry, candidates: 0, plans: [] });
  }

  const { data: leads, error: leadsError } = await jai
    .from("leads")
    .select(
      "contact_number, contact_name, is_member, ai_paused, silent_nudge1_sent_at, silent_nudge2_sent_at"
    )
    .in("contact_number", numbers);
  if (leadsError) {
    console.error("[lead-followup] lead-state read FAILED, sending nothing:", leadsError.code, leadsError.message);
    return NextResponse.json({ error: "lead state unavailable", code: leadsError.code }, { status: 500 });
  }
  const leadByNumber = new Map((leads || []).map((l) => [l.contact_number as string, l]));

  const plans: Plan[] = [];
  // A nudge that reached the customer but never reached the inbox is a real
  // failure, so it is reported in the response, not only to the log.
  const mirrorFailures: { to: string; error: string }[] = [];
  // A failed stamp is worse than a failed mirror: the mirror only costs
  // visibility, the stamp costs the customer a duplicate message every 30 min.
  const stampFailures: { to: string; stage: string; error: string }[] = [];
  let nudged1 = 0;
  let nudged2 = 0;
  let cold = 0;
  let failed = 0;

  for (const to of numbers) {
    const armAt = armAtByContact.get(to)!;
    const lead = leadByNumber.get(to);
    // No lead row means no way to check ai_paused or is_member — don't guess.
    if (!lead) {
      plans.push({ to, stage: "skip", reason: "no lead row" });
      continue;
    }
    if (lead.is_member) {
      plans.push({ to, stage: "skip", reason: "member" });
      continue;
    }
    if (lead.ai_paused) {
      plans.push({ to, stage: "skip", reason: "ai_paused (Jeremy has the chat)" });
      continue;
    }

    // Read mixed-author history so eligibility can distinguish a genuine
    // unanswered CTA from closure, decline, handoff, reschedule, or a manual
    // coach reply. Author metadata is load-bearing here.
    const { data: recentRows, error: recentError } = await jai
      .from("conversations")
      .select("created_at, message, role, via")
      .eq("contact_number", to)
      .order("created_at", { ascending: false })
      .limit(20);
    if (recentError) {
      console.error("[lead-followup] conversation-history read FAILED, skipping contact:", to, recentError.code, recentError.message);
      plans.push({ to, stage: "skip", reason: "conversation history unavailable" });
      continue;
    }
    const eligibility = evaluateFollowupEligibility({
      history: recentRows || [],
      anchorAt: armAt,
      answerBody: anchorBodyByContact.get(to) || "",
      armedBy: armedBy(to),
    });
    if (!eligibility.eligible) {
      plans.push({ to, stage: "skip", reason: eligibility.reason });
      continue;
    }

    // Their last inbound: both the "have they replied since?" test and the
    // clock Meta's 24h customer-service window actually runs on.
    const lastUserRows = (recentRows || []).filter((row) => row.role === "user");
    const lastUserAt = lastUserRows?.[0] ? new Date(lastUserRows[0].created_at).getTime() : 0;

    // Which language to nudge her in. Her OWN messages only — the assistant's
    // side is exactly what got this wrong. Ten of them, not one: Vivi@n's last
    // inbound was "ok thanks", so reading only the newest would have classed a
    // Mandarin-only lead as an English speaker. See detectLangFromHistory.
    const lang = detectLangFromHistory(
      (lastUserRows ?? []).map((r: { message?: string | null }) => r.message ?? "")
    );

    const decision = decideNudge({
      now,
      linkAt: armAt,
      lastUserAt,
      nudge1At: lead.silent_nudge1_sent_at ? new Date(lead.silent_nudge1_sent_at).getTime() : null,
      nudge2At: lead.silent_nudge2_sent_at ? new Date(lead.silent_nudge2_sent_at).getTime() : null,
    });

    if (decision.stage === "wait" || decision.stage === "done") {
      plans.push({ to, stage: decision.stage, reason: decision.reason });
      continue;
    }

    // A trial booking (kids trials still run on Calendly) means the funnel is
    // finished. Note: a $42 drop-in bought on the website is NOT recorded in
    // this database at all, so it cannot be checked — which is why both drafts
    // read safely for someone who has already booked.
    const booked = await findBookingsByPhone(pub, to);
    if (booked.length > 0) {
      plans.push({ to, stage: "skip", reason: "has a booking" });
      continue;
    }

    if (decision.stage === "cold") {
      // Stamp nudge 2 so the sequence is closed and no future run retries.
      // Nothing is sent — the lead simply shows in the WA INBOX for Jeremy.
      if (!dry) {
        await jai
          .from("leads")
          .update({ silent_nudge2_sent_at: new Date().toISOString() })
          .eq("contact_number", to);
      }
      cold++;
      plans.push({ to, stage: "cold", reason: decision.reason });
      continue;
    }

    // The Chinese follow-up copy has not been approved for sending in Jeremy's
    // name. Do not fall back to English or send the pending draft. It remains
    // visible in dry-run plans until its wording is explicitly signed off.
    if (lang === "zh") {
      plans.push({ to, stage: "skip", reason: "Chinese follow-up copy awaiting approval" });
      continue;
    }

    const first = firstNameFrom(lead.contact_name);
    const isFirst = decision.stage === "nudge1";
    // Two nudges per lead in total, whichever source armed them — the stamps
    // are shared columns, deliberately. Someone who was answered and then later
    // sent a link should get two messages from us, not four.
    const text =
      armedBy(to) === "link"
        ? isFirst
          ? dropinNudge1(first, lang, followupFacts)
          : dropinNudge2(first, lang, followupFacts)
        : isFirst
          ? silentNudge1(first, lang)
          : silentNudge2(first, lang);

    if (dry) {
      plans.push({ to, stage: decision.stage, reason: "dry run — not sent" });
      continue;
    }

    // Freeform, not a template: both nudges are inside the customer-service
    // window by construction (decideNudge refuses to send outside it).
    const ok = await sendText(to, `*Jai*\n${text}`);
    if (!ok) {
      // sendText already logged the Meta error. Do NOT stamp — a failed send
      // must not burn one of the two nudges; the next run retries while the
      // window is still open, and closes the sequence when it isn't.
      failed++;
      plans.push({ to, stage: decision.stage, sent: false, reason: "send failed" });
      continue;
    }

    // Mirror into the WA INBOX thread. Never let a mirror failure lose the
    // stamp — an unstamped successful send is a double-send next run.
    // via=FOLLOWUP_VIA, not 'bot': both arming queries above must not see this
    // row as evidence of a conversation (the inbox still renders it as Jai).
    // 🛑 supabase-js does NOT throw on a database error — it resolves with
    // { error }. A bare try/catch here caught nothing, so a failed mirror was
    // silent: the nudge reached the customer and never appeared in Jeremy's
    // inbox, with nothing logged. Check the returned error, and count it.
    try {
      const { error: mirrorError } = await jai.from("conversations").insert({
        contact_number: to,
        contact_name: lead.contact_name,
        role: "assistant",
        message: text,
        via: FOLLOWUP_VIA,
      });
      if (mirrorError) {
        console.error("[lead-followup] WA INBOX mirror failed", to, mirrorError.message);
        mirrorFailures.push({ to, error: mirrorError.message });
      }
    } catch (e) {
      console.error("[lead-followup] WA INBOX mirror threw", to, e);
      mirrorFailures.push({ to, error: e instanceof Error ? e.message : String(e) });
    }
    // 🛑 The mirror above was fixed and THIS was left unchecked — the one write
    // that actually prevents a re-send. supabase-js resolves with { error }, so
    // a failed stamp is invisible and decideNudge returns nudge1 again on the
    // next */30 run: the customer gets the identical message every half hour.
    // The comment at the top of this block states exactly that rule.
    const { error: stampError } = await jai
      .from("leads")
      .update({ [isFirst ? "silent_nudge1_sent_at" : "silent_nudge2_sent_at"]: new Date().toISOString() })
      .eq("contact_number", to);
    if (stampError) {
      console.error("[lead-followup] STAMP FAILED — this WILL re-send", to, stampError.message);
      stampFailures.push({ to, stage: isFirst ? "nudge1" : "nudge2", error: stampError.message });
    }

    if (isFirst) nudged1++;
    else nudged2++;
    plans.push({ to, stage: decision.stage, sent: true, reason: armedBy(to) });
  }

  return NextResponse.json({
    ok: true,
    dry,
    candidates: numbers.length,
    nudged1,
    nudged2,
    cold,
    failed,
    mirror_failed: mirrorFailures.length,
    mirror_failures: mirrorFailures,
    stamp_failed: stampFailures.length,
    stamp_failures: stampFailures,
    plans,
  });
}
