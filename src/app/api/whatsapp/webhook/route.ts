// JMT AI Bot (JAI) WhatsApp webhook — hosted inside JMT OS (Option A).
//
// GET  /api/whatsapp/webhook  → Meta handshake verification
// POST /api/whatsapp/webhook  → inbound WhatsApp message → save → AI reply → send.
//
// Writes every message to the `jai` schema (conversations + leads) so the
// master_admin WA INBOX reflects live chats. If Jeremy has paused a contact
// from the inbox, the message is still logged but the bot stays quiet.
import { NextRequest, NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { generateReply, type Escalation } from "@/lib/wa/jai-reply";
import { buildContactContext, fetchMemberNotes } from "@/lib/wa/member-lookup";
// Layer 2 — class times + prices answered from the fact sheet, never the model.
// The sheet is passed IN (read live from the DB) so an edit in Supabase changes
// these answers with no deploy, exactly like the model path.
import { DROPIN_BOOKING_URL } from "@/lib/wa/followup-dropin";
import {
  hasBookingOffer,
  buildDeterministicAnswer,
  isOfferAcceptance,
  lateArrivalAnswer,
} from "@/lib/wa/deterministic-answers";
import { detectLang } from "@/lib/wa/lang";
import { getJaiFacts } from "@/lib/wa/jai-facts";
import { extractMessage, isStatusUpdate, sendText, sendQuickReplies, markRead } from "@/lib/wa/jai-send";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { cancelCalendlyEvent } from "@/lib/calendly";
import { verifyMetaSignature } from "@/lib/meta-webhook";
import {
  detectJoinIntent,
  hasDisallowedPrice,
  hasDeadAdultLink,
  JOIN_HANDOFF_TEXT,
  JOIN_HANDOFF_SUFFIX,
  inboundHasUnknownFigure,
  PAUSED_ADULT_TRIAL_TEXT,
  offerAcceptedText,
  ANTI_LOOP_HANDOFF_TEXT,
} from "@/lib/wa/join-intent";
import { sessionBotReplyCount, isRepeatingItself } from "@/lib/wa/session-window";
import { pauseIsStale } from "@/lib/wa/pause-stale";
import { transitionExactPublicLead } from "@/lib/leads/lifecycle-service";
import {
  buildPauseMetadata,
  clearPauseMetadata,
  isMissingPauseMetadataColumn,
} from "@/lib/wa/pause-metadata";
import {
  detectHumanTakeoverIntent,
  detectRescheduleIntent,
  hasUnverifiedOperationalClaim,
  isBookingPolicyQuestion,
  HUMAN_TAKEOVER_TEXT,
  OPERATIONAL_CONFIRMATION_TEXT,
  RESCHEDULE_TEXT,
} from "@/lib/wa/human-takeover";


/** What the anti-loop guard says. Named because the guard must be able to
 *  recognise its OWN output and not mistake it for JAI repeating itself. */
import {
  BOOKING_HINT_MARKER,
  confirmationText,
  findBookingsByHint,
  findBookingsByPhone,
  fmtTime,
  notFoundQuestion,
  stillNotFoundText,
} from "@/lib/wa/trial-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Done-verification can wait ~8s for Calendly's webhook to land before re-checking.
export const maxDuration = 30;

// Require the verify token from the env — no literal fallback (a hardcoded
// fallback would let anyone re-subscribe the webhook).
const VERIFY_TOKEN = () => (process.env.WA_VERIFY_TOKEN || "").trim();

// ── Handshake ────────────────────────────────────────────────────────────────
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = (p.get("hub.verify_token") || "").trim();
  const challenge = p.get("hub.challenge") || "";
  const expected = VERIFY_TOKEN();
  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// ── Inbound message ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Verify Meta's HMAC signature on the RAW body BEFORE parsing. Fail closed:
  // missing META_APP_SECRET or missing/invalid signature → 403.
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed so Meta doesn't retry
  }

  try {
    if (isStatusUpdate(body)) return NextResponse.json({ ok: true });

    const msg = extractMessage(body);
    if (!msg || !msg.text) return NextResponse.json({ ok: true });

    const { from, contactName, messageId, text } = msg;
    const sb = createJaiClient();

    // Idempotency — TWO-PHASE claim that FAILS OPEN. Meta re-delivers the same
    // webhook if we don't ack fast enough. We only suppress a retry when we can
    // POSITIVELY confirm a reply already went out (row exists AND handled=true).
    // Any uncertainty — DB error, or a row that was claimed but never marked
    // handled (a prior attempt died mid-send) — means we PROCEED and (re)reply.
    // Never infer "duplicate" from a null/error that could just mean the query
    // failed. `markHandled()` (below) flips handled=true only AFTER a successful
    // WhatsApp send, so a customer never loses a reply to a crashed attempt.
    const markHandled = async () => {
      if (!messageId) return;
      const { error } = await sb
        .from("processed_messages")
        .update({ handled: true })
        .eq("wa_message_id", messageId);
      if (error) console.error("[jai-webhook] markHandled failed", error);
    };
    const markPublicLeadContacted = async () => {
      try {
        await transitionExactPublicLead({
          identity: { phone: from },
          to: "contacted",
          trigger: "outbound_contact",
          source: { schema: "jai", table: "conversations", key: messageId || `contact:${from}` },
          actor: { type: "jai" },
        });
      } catch (error) {
        console.error("[jai-webhook] lead lifecycle update failed", error);
      }
    };
    const markPublicLeadInbound = async () => {
      try {
        await transitionExactPublicLead({
          identity: { phone: from },
          to: "contacted",
          trigger: "reopened",
          source: {
            schema: "jai",
            table: "conversations",
            key: messageId || `inbound:${from}:${crypto.randomUUID()}`,
          },
          actor: { type: "system" },
        });
      } catch (error) {
        console.error("[jai-webhook] inbound lead lifecycle update failed", error);
      }
    };

    if (messageId) {
      const { error: claimErr } = await sb
        .from("processed_messages")
        .insert({ wa_message_id: messageId });
      if (claimErr) {
        if (claimErr.code === "23505") {
          // Unique violation → we've seen this id. Suppress ONLY if a reply is
          // confirmed sent (handled=true); otherwise fall through and re-handle.
          const { data: existing } = await sb
            .from("processed_messages")
            .select("handled")
            .eq("wa_message_id", messageId)
            .maybeSingle();
          if (existing?.handled === true) {
            return NextResponse.json({ ok: true, dedup: true });
          }
          // Row exists but no reply confirmed → prior attempt died mid-flight.
          // Fail open: proceed and reply.
        } else {
          // Any other DB error → fail OPEN, never treat as a duplicate.
          console.error("[jai-webhook] dedup claim insert failed, proceeding", claimErr);
        }
      }
    }

    // History BEFORE this message → tells us if it's a brand-new contact.
    //
    // ORDER MATTERS, and it was wrong: `ascending: true` + `limit(20)` returns
    // the OLDEST twenty messages, so a returning customer's context was their
    // conversation from weeks ago and nothing recent. Fetch newest-first, then
    // reverse back to chronological for everything downstream.
    const { data: priorDesc } = await sb
      .from("conversations")
      .select("role, message, created_at")
      .eq("contact_number", from)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(20);
    const prior = (priorDesc || []).slice().reverse();
    const isNewContact = prior.length === 0;

    // Log the inbound message.
    await sb.from("conversations").insert({
      contact_number: from,
      contact_name: contactName,
      role: "user",
      message: text,
    });

    // Ensure a lead row exists (drives the inbox name + AI-pause toggle).
    await sb
      .from("leads")
      .upsert(
        { contact_number: from, contact_name: contactName },
        { onConflict: "contact_number", ignoreDuplicates: true }
      );

    // A customer returning after being marked Lost immediately reopens the
    // exact, unique public lead. This happens before pause/handoff checks, so a
    // human-owned conversation is still reflected in the lifecycle.
    await markPublicLeadInbound();

    // They replied — disarm the silent-lead follow-up funnel (re-arms if the
    // bot sends another booking link below).
    await sb
      .from("leads")
      .update({ booking_link_sent_at: null, followup1_sent_at: null, followup2_sent_at: null })
      .eq("contact_number", from)
      .not("booking_link_sent_at", "is", null);

    markRead(messageId).catch(() => {});

    // Jeremy has taken over this chat from the inbox → stay quiet (still logged above).
    let leadRead = await sb
      .from("leads")
      .select("ai_paused, is_member, contact_name, ai_pause_expires_at")
      .eq("contact_number", from)
      .maybeSingle();
    if (leadRead.error && isMissingPauseMetadataColumn(leadRead.error)) {
      leadRead = await sb
        .from("leads")
        .select("ai_paused, is_member, contact_name")
        .eq("contact_number", from)
        .maybeSingle() as typeof leadRead;
    }
    const lead = leadRead.data;

    // A pause is a HANDOFF, not a permanent mute. Nothing has ever cleared
    // ai_paused, so 28 of 83 leads were silently muted for good (2026-09-02).
    // If no human has replied in this thread for 24h Jeremy is not on it, so
    // JAI takes the chat back and answers normally from here down. If he
    // replied inside 24h the chat stays his. pauseIsStale fails closed.
    let paused = lead?.ai_paused === true;
    if (paused && (await pauseIsStale(sb, from, Date.now(), lead?.ai_pause_expires_at))) {
      let { error: resumeErr } = await sb
        .from("leads")
        .update(clearPauseMetadata())
        .eq("contact_number", from);
      if (resumeErr && isMissingPauseMetadataColumn(resumeErr)) {
        const legacy = await sb
          .from("leads")
          .update({ ai_paused: false })
          .eq("contact_number", from);
        resumeErr = legacy.error;
      }
      if (resumeErr) {
        // Could not clear the flag — stay quiet rather than reply while the
        // inbox still shows the chat as Jeremy's.
        console.error("[jai-webhook] auto-resume update failed, staying paused", resumeErr);
      } else {
        paused = false;
        console.log(
          `[jai-webhook] auto-resumed ai_paused for +${from} — no human reply in 24h`
        );
      }
    }

    // Ping the master_admin(s) on Telegram at the start of each conversation
    // burst (first inbound after 30+ quiet minutes) so WA INBOX messages never
    // have to be discovered by opening the app. Runs for paused chats too —
    // those are exactly the ones waiting on Jeremy. Escalations further down
    // still send their own (more specific) alert.
    try {
      const { data: prevIn } = await sb
        .from("conversations")
        .select("created_at")
        .eq("contact_number", from)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .range(1, 1); // row 0 is the message inserted above
      const prevTs = prevIn?.[0]?.created_at as string | undefined;
      const quietMin = prevTs ? (Date.now() - new Date(prevTs).getTime()) / 60000 : Infinity;
      if (quietMin > 30) {
        const who = contactName ? `${contactName} (+${from})` : `+${from}`;
        const preview = text.length > 120 ? text.slice(0, 117) + "..." : text;
        const status = paused
          ? "JAI is off for this chat - it's waiting for you."
          : isNewContact
            ? "New enquiry - JAI is replying."
            : "JAI is replying.";
        const note =
          `Boss, WhatsApp from ${who}:\n` +
          `"${preview}"\n` +
          `${status}\n` +
          `https://jmtos.ionicx.ai/wa-inbox?contact=${from}`;
        const pubNotify = createSbClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: masters } = await pubNotify
          .from("users")
          .select("id")
          .eq("role", "master_admin");
        for (const a of masters || []) {
          await sendTelegramPlainToUser(a.id, note, "jai-wa-inbox");
        }
      }
    } catch (e) {
      console.error("[jai-webhook] wa-inbox notify failed", e);
    }

    if (paused) {
      // Handling is complete: logged + intentional silence (Jeremy owns this
      // chat and replied within the last 24h). No reply is owed, so it's safe
      // to mark handled and dedup retries.
      await markHandled();
      return NextResponse.json({ ok: true });
    }

    // ── Hardcoded "Done" booking verification (bypasses the AI entirely) ──
    // Triggered by the Done quick-reply tap (or typed "done"), or by the
    // customer's answer to our "different name or phone number?" question.
    const isDoneTap = text.trim().toLowerCase() === "done";
    const lastAssistant =
      [...prior].reverse().find((m) => m.role === "assistant")?.message || "";
    const awaitingHint = lastAssistant.includes(BOOKING_HINT_MARKER);

    if (isDoneTap || awaitingHint) {
      const pub = createSbClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const reply = async (out: string) => {
        await sb.from("conversations").insert({
          contact_number: from,
          contact_name: contactName,
          role: "assistant",
          message: out,
          via: "bot",
        });
        const delivered = await sendText(from, `*Jai*\n${out}`);
        if (delivered) {
          await markPublicLeadContacted();
          await markHandled(); // reply delivered → safe to dedup retries
        }
      };

      const pingAdmins = async (note: string) => {
        try {
          const { data: admins } = await pub
            .from("users")
            .select("id")
            .eq("role", "master_admin");
          for (const a of admins || []) {
            await sendTelegramPlainToUser(a.id, note, "jai-trial-verify");
          }
        } catch (e) {
          console.error("[jai-webhook] trial-verify admin ping failed", e);
        }
      };

      if (isDoneTap) {
        let bookings = await findBookingsByPhone(pub, from);
        if (bookings.length === 0) {
          // Calendly's webhook can lag behind a fast tapper — wait, re-check
          // once before bothering the customer.
          await new Promise((r) => setTimeout(r, 8000));
          bookings = await findBookingsByPhone(pub, from);
        }
        if (bookings.length > 0) {
          await reply(confirmationText(bookings));
          const b = bookings[0];
          await pingAdmins(
            `✅ Boss, new trial verified & booked: ${b.name} — ${b.className}, ${b.booking_date} ${fmtTime(b.startTime)} (confirmed via bot)`
          );
        } else {
          await reply(notFoundQuestion());
        }
        return NextResponse.json({ ok: true });
      }

      // awaitingHint: their answer = the name or number they booked with.
      // But don't hijack unrelated messages — if it reads like a question or
      // a long sentence with no phone number, let the AI handle it normally.
      const looksLikeHint =
        text.replace(/\D/g, "").length >= 7 ||
        (!text.includes("?") && text.trim().split(/\s+/).length <= 6);
      if (!looksLikeHint) {
        // fall through to the normal AI flow below
      } else {
      const bookings = await findBookingsByHint(pub, from, text);
      if (bookings.length > 0) {
        await reply(confirmationText(bookings));
        const b = bookings[0];
        await pingAdmins(
          `✅ Boss, new trial verified & booked (under "${text.trim()}"): ${b.name} — ${b.className}, ${b.booking_date} ${fmtTime(b.startTime)} (confirmed via bot, WA +${from})`
        );
      } else {
        await reply(stillNotFoundText());
        await pingAdmins(
          `⚠️ Boss, ${contactName || "a customer"} (+${from}) tapped Done but I can't find their booking — they said they booked with "${text.trim()}". Please check Trial Management / Calendly and confirm with them.`
        );
      }
      return NextResponse.json({ ok: true });
      }
    }

    // Member recognition — tell JAI who it's talking to (known member /
    // returning contact / new) so it greets appropriately instead of defaulting
    // to the brand-new greeting. member_notes is read defensively (optional col).
    const memberNotes = lead?.is_member ? await fetchMemberNotes(sb, from) : null;
    const contactContext = buildContactContext({
      isMember: lead?.is_member ?? false,
      contactName: lead?.contact_name ?? contactName,
      memberNotes,
      history: prior,
    });

    // ── Join / promo intent — deterministic, runs BEFORE the model ─────────
    // Isaac, 2026-07-29: "if trial or anyone say they want to join, ping jeremy
    // right away. let him to handle." On a clear buy/promo signal we skip the
    // model entirely — it cannot quote, guess or negotiate a promo if it never
    // runs. (The prompt also asks the model to emit JOIN_INTENT for phrasings
    // this regex misses; both funnel into the same handling below.)
    // Isaac, same evening: "still quote the standard rate for adult class. dont
    // go quiet on the lead." A plain RATE question is NOT a hit — it returns
    // null here, goes to the model, and gets the standard rate + rates link.
    const joinHit = detectJoinIntent(text);

    // ── LAYER 2 — deterministic schedule / price answers (bypasses the AI) ──
    // Same idea and same slot as the "Done" branch above: the two questions that
    // cost money when the model paraphrases them (class TIMES and PRICES) are a
    // pure lookup, so we answer them from the fact sheet in code. Everything
    // above still ran — only the DeepSeek call is skipped.
    // buildDeterministicAnswer returns null whenever it is not confident, or the
    // sheet is not in a shape it understands, and we fall through to the model.
    //
    // Placed AFTER joinHit deliberately: a buy signal outranks a price question.
    // Isaac, 2026-07-29 — "if anyone say they want to join, ping jeremy right
    // away" — so a lead saying "how much to sign up today" must reach Jeremy,
    // not get a price list from a lookup table.
    //
    // Two more exclusions:
    //  • brand-new contacts — their first message must get the greeting flow.
    //  • known members on a PRICE question — member mode must not quote
    //    new-joiner prices. Schedule is fine for members.
    // Late arrival is answered from the rule, not the model — it flips a coin on
    // the 15-minute boundary and got it wrong for a real customer on 31 Aug.
    // Runs for new contacts too: someone messaging "i'll be 20 mins late" needs
    // the answer more than they need the greeting.
    if (!joinHit) {
      // Recent turns so a class named earlier in the thread is still findable.
      const recentTurns = prior.slice(-6).map((m) => m.message);
      const late = lateArrivalAnswer(text, undefined, recentTurns);
      if (late) {
        await sb.from("conversations").insert({
          contact_number: from,
          contact_name: contactName,
          role: "assistant",
          message: late.messageText,
          via: "bot",
        });
        const delivered = await sendText(from, `*Jai*\n${late.messageText}`);
        if (delivered) {
          await markPublicLeadContacted();
          await markHandled(); // reply delivered → safe to dedup retries
        }
        return NextResponse.json({ ok: true });
      }
    }

    // ── They said yes to the booking link ────────────────────────────────
    // We offered; this is the answer. Anything but a refusal gets the link,
    // deterministically — the model previously read "All right thank you!" as
    // a sign-off and sent nothing (Arthur, 11 Sep 2026).
    // 🛑 Narrow on purpose. The first version of this branch returned before the
    // join handling and before the deterministic answer, so it hijacked the turn
    // after every price quote: "i want to sign up for the unlimited membership"
    // got a drop-in link and Jeremy was NEVER pinged, and "what time is the kids
    // class on saturday?" got an adult $42 pitch. Caught by the /predeploy code
    // review lane, 12 Sep 2026.
    //
    // A yes to "want me to send you the booking link?" is SHORT and carries no
    // question of its own. Anything longer, anything with a question mark, any
    // buy signal, and anything the deterministic layer can answer properly is
    // not this — it is a new topic, and it belongs to the paths below.
    // Only worth computing when the offer is actually on the table — otherwise
    // this ran getJaiFacts() and buildDeterministicAnswer() on EVERY inbound
    // message, including join and new-contact turns, and built the deterministic
    // answer twice per message.
    const offerOnTable = hasBookingOffer(lastAssistant);
    const lastAssistantAt = offerOnTable
      ? [...prior].reverse().find((m) => m.role === "assistant")?.created_at
      : undefined;
    const offerAnswer =
      offerOnTable &&
      isOfferAcceptance({
        lastAssistant,
        text,
        joinHit,
        hasDeterministicAnswer: Boolean(buildDeterministicAnswer(text, await getJaiFacts())),
        offerAgeMs: lastAssistantAt ? Date.now() - new Date(lastAssistantAt).getTime() : null,
      });

    if (offerAnswer) {
      const out = offerAcceptedText(DROPIN_BOOKING_URL);
      await sb.from("conversations").insert({
        contact_number: from,
        contact_name: contactName,
        role: "assistant",
        message: out,
        via: "bot",
      });
      const delivered = await sendText(from, `*Jai*\n${out}`);
      if (delivered) {
        await markPublicLeadContacted();
        await markHandled();
      }
      return NextResponse.json({ ok: true });
    }

    if (!joinHit && !isNewContact) {
      const det = buildDeterministicAnswer(text, await getJaiFacts());
      if (det && !(det.intent === "PRICE" && lead?.is_member)) {
        await sb.from("conversations").insert({
          contact_number: from,
          contact_name: contactName,
          role: "assistant",
          message: det.messageText,
          via: "bot",
        });
        const out = `*Jai*\n${det.messageText}`;
        let delivered: boolean;
        if (det.quickReplies.length > 0 && out.length <= 1000) {
          delivered = await sendQuickReplies(from, out, det.quickReplies);
          if (!delivered) delivered = await sendText(from, out);
        } else {
          delivered = await sendText(from, out);
        }
        if (delivered) {
          await markPublicLeadContacted();
          await markHandled(); // reply delivered → safe to dedup retries
        }
        return NextResponse.json({ ok: true });
      }
    }

    const history = [...prior, { role: "user" as const, message: text }];
    // A join question gets ANSWERED, then handed over — never handed over
    // INSTEAD of answered.
    //
    // The 30 July guard (f6fa386) was right about the danger and wrong about
    // the cure. It was added the day after JAI invented a "$252 promo", and
    // Isaac's instruction in that commit was "still quote the standard rate...
    // dont go quiet on the lead". It did the first half and broke the second:
    // it replaced the whole reply, so the warmest message a lead can send got
    // nothing but "Jeremy will sort it out".
    //
    // Reading all 96 threads on 1 Sep: the bare handoff fired 9 times, three of
    // those threads died on the spot, and every one that survived did so only
    // because a human happened to be free within about fifteen minutes. It even
    // fired on "Okay thank you", and on a customer asking a class size JAI had
    // already told them six messages earlier.
    //
    // The invented-price danger is still covered, three deep: the fact guard
    // blocks any time, price or link not in the sheet; hasDisallowedPrice below
    // bins a reply quoting a figure outside the rate card; and Jeremy is still
    // pinged with JOIN_INTENT either way. What changes is that the customer now
    // leaves with the standard rate in hand instead of silence.
    // A promo ask is answered by the canned handoff, so there is nothing for the
    // model to contribute — don't call it. Hoisting this above the branch cost
    // 1-2 provider calls per promo ask and, worse, made "a promo ask never
    // reaches the model" untrue in the one place someone would check.
    // A buy signal is answerable only if the customer's own message carries no
    // figure we cannot account for. The intent split alone was not enough: the
    // clock-time exemption inside the classifier let a bare promo number ride
    // in on a join question. See inboundHasUnknownFigure.
    const answerableJoin =
      joinHit === "wants_to_join" && !inboundHasUnknownFigure(text);
    const promoHandoff = !!joinHit && !answerableJoin;
    // Booking changes and explicit requests for a real person are not safe
    // model tasks. Stop before generation so JAI cannot invent a changed slot,
    // coach availability, or another automated check-in while a human is due.
    const humanTakeover = detectHumanTakeoverIntent(text);
    const rescheduleAsk = humanTakeover && detectRescheduleIntent(text);
    const { messageText, quickReplies, escalation, member } = humanTakeover
      ? {
          messageText: rescheduleAsk ? RESCHEDULE_TEXT : HUMAN_TAKEOVER_TEXT,
          quickReplies: [] as string[],
          // Not TRIAL_CANCEL: a regex must never cancel a real booking. Jeremy moves
          // it; the customer is told the booking stands until he does.
          escalation: rescheduleAsk
            ? { escalation: "GENERAL_ESCALATION", intent: "reschedule_request", source: "guard" }
            : { escalation: "GENERAL_ESCALATION", intent: "explicit_human_takeover", source: "guard" },
          member: false,
        }
      : promoHandoff
      ? {
          messageText: JOIN_HANDOFF_TEXT,
          quickReplies: [] as string[],
          escalation: null,
          member: false,
        }
      : await generateReply(
          history,
          isNewContact,
          contactName,
          lead?.is_member ?? false,
          contactContext
        );

    // ── Deterministic anti-loop guard ──────────────────────────────────────
    // LLMs ignore "don't repeat" under pressure, so we backstop it in code.
    // If JAI is about to resend a booking link it just sent, or the chat has
    // dragged on with no resolution, hand to Coach Jeremy and go quiet instead
    // of looping the same reply (the 2026-07-09 "looked dumb" failure).
    const priorBot = prior.filter((m) => m.role === "assistant");
    const prevBotMsg = [...priorBot].reverse()[0]?.message || "";

    // "This conversation" ends at the first gap of 6h or more — see
    // sessionBotReplyCount. Counting for all time meant a returning customer was
    // permanently handed off.
    const sessionBotCount = sessionBotReplyCount(prior);
    const resendingLink =
      /calendly\.com\//i.test(messageText) && /calendly\.com\//i.test(prevBotMsg);
    // A LOOP, not a long conversation. Eight replies used to be enough on its
    // own, and on 2 Sep that hit Isaac mid-test: he asked "How do I join?",
    // "Can I come tonight?", "What do I need to bring?", "My wife want to come
    // also.", "Can my kids come?" — five different, answerable questions — and
    // the last two got "Let me get Coach Jeremy to sort this out for you
    // directly" because the counter had passed eight. Someone asking eight
    // questions is the most engaged lead of the day, not a stuck one.
    //
    // The guard exists for JAI repeating itself (see resendingLink above), so
    // require actual repetition, with a hard ceiling so a genuinely stuck chat
    // still reaches a human.
    // THE GUARD MUST NOT COUNT ITS OWN OUTPUT. First version of this shipped at
    // 02:20 on 2 Sep and made things worse: once it had fired twice, JAI's last
    // two messages were both the handoff line, so "repeating itself" was true
    // forever and every later question got the same deflection. Isaac watched
    // it happen three times in a row. Ignore the handoff when judging
    // repetition — that is the guard looping, not JAI.
    // Extracted to session-window.ts so it can be tested — this decision has now
    // been wrong twice in production, and neither version had a test.
    const repeatingItself = isRepeatingItself(
      priorBot.map((m) => String(m.message ?? "")),
      ANTI_LOOP_HANDOFF_TEXT
    );
    const dragging = (sessionBotCount >= 8 && repeatingItself) || sessionBotCount >= 20;
    // The takeover guard already sent a fixed handoff with its own intent
    // (reschedule_request / explicit_human_takeover); replacing it here would hide
    // that intent from Jeremy's alert.
    const forceHandoff =
      !humanTakeover &&
      (resendingLink || dragging) &&
      (!escalation || escalation.escalation === "GENERAL_ESCALATION");

    let outText = forceHandoff ? ANTI_LOOP_HANDOFF_TEXT : messageText;
    let outQuick = forceHandoff ? [] : quickReplies;
    // A buy signal outranks the anti-loop guard. Before the split this was
    // structurally impossible — a join hit never reached here — so forceHandoff
    // could not downgrade one to GENERAL_ESCALATION, lose its priority and skip
    // the join-specific dedupe. It can now, unless join wins.
    let esc: Escalation | null = joinHit
      ? { escalation: "JOIN_INTENT", intent: joinHit, source: "guard" }
      : forceHandoff
        ? {
            escalation: "GENERAL_ESCALATION",
            intent: resendingLink ? "loop_break" : "conversation_stuck",
            source: "guard",
          }
        : escalation;

    // Jeremy is pinged (above) AND the customer keeps the answer. The handoff
    // is a closing line now, never the whole message. Skipped when the reply is
    // already being replaced by a handoff, so we never send it twice.
    // ONLY a genuine "I want to join" is answered. A promo ask is not, and the
    // difference is the whole 2026-07-29 incident:
    //
    //   customer: "is the $252 offer still on?"
    //   model:    "I believe that's the 3-month rate at $250/month"   ← ships
    //   model:    "Yes, that rate is still valid"                     ← ships
    //
    // Both outbound guards only test whether a figure is ON the rate card. 250
    // is, and the second reply has no digits at all, so neither guard can see
    // either one. join-intent.ts:209 wrote that prediction down months ago; the
    // inbound classifier is the only thing that catches it, and it only works
    // if promo_ask / quoted_promo_price never reach the model. So they keep the
    // whole-message handoff. wants_to_join — a rate question, a "how do I
    // start" — is answered, which is what Isaac asked for.
    if (promoHandoff) {
      outQuick = [];
    } else if (answerableJoin && !forceHandoff && !/getting Coach Jeremy|Coach Jeremy will (?:be in touch|reach)/i.test(outText)) {
      // A model-authored button is text nobody guards — hasDisallowedPrice only
      // ever inspects outText. Clearing them was the fourth thing the old
      // moneyHandoff flag did, and it belongs on this side of the split.
      outQuick = [];
      outText = `${outText}\n\n${JOIN_HANDOFF_SUFFIX}`;
    } else if (answerableJoin) {
      // The draft already promises Jeremy, so appending the suffix would say it
      // twice. That reached a real customer on 2 Sep: the fact sheet still told
      // the model to reply with the handoff line and nothing else, so it wrote
      // "Great — I'm getting Coach Jeremy on this now" and the suffix landed on
      // top. The sheet is fixed; this makes it structurally impossible.
      outQuick = [];
    }

    // Only a real request may release a booking. A model TRIAL_CANCEL on a policy
    // question is downgraded so Jeremy is told but nothing is cancelled.
    if (esc?.escalation === "TRIAL_CANCEL" && isBookingPolicyQuestion(text)) {
      esc = { escalation: "GENERAL_ESCALATION", intent: "reschedule_policy_question", source: esc.source ?? "guard" };
    }

    // A timetable is not live availability. If the model promises the gym is
    // open, a coach is present, or an unconfirmed time works, replace the
    // unsupported operational claim and ask Jeremy to confirm (JAI keeps answering).
    if (!humanTakeover && hasUnverifiedOperationalClaim(outText)) {
      outText = OPERATIONAL_CONFIRMATION_TEXT;
      outQuick = [];
      // Keep an escalation the reply already carried (TRIAL_CANCEL / PT_LEAD /
      // JOIN_INTENT...): overwriting it would lose the slot release or the lead label.
      esc = esc ?? { escalation: "GENERAL_ESCALATION", intent: "live_availability_unverified", source: "guard" };
    }

    // ── Money guard (last line of defence) ─────────────────────────────────
    // The fact sheet holds the STANDARD rate card and no promo, but the model
    // can still parrot a figure the CUSTOMER quoted ("the $252 offer") or
    // invent one — exactly what happened on 2026-07-29. Any money amount
    // outside the standard rate card ("$252", "252 dollars", "252 SGD",
    // "252/mo") means the reply is quoting a promo it doesn't have: bin it and
    // hand to Jeremy instead. Standard-card figures pass through untouched.
    // Checked on EVERY reply now, including a join hit. It used to skip anything
    // already marked JOIN_INTENT, which was safe only because a join hit never
    // reached here with model text — it does now, so this is the guard that
    // makes answering a join question safe.
    const priceLeak = hasDisallowedPrice(outText);
    if (priceLeak) {
      console.warn("[jai-webhook] blocked price in outbound, escalating instead");
      esc = { escalation: "JOIN_INTENT", intent: "price_blocked", source: "guard" };
      // A leaked figure means the TEXT is untrustworthy — bin it. This is the one
      // case that still replaces rather than appends, and it is the case the
      // 2026-07-29 "$252" incident was actually about.
      outText = JOIN_HANDOFF_TEXT;
      outQuick = [];
    }

    // Two things used to be one flag, and conflating them is what muted JAI for
    // 28 of 83 leads (nothing ever clears ai_paused):
    //   • joinEscalation — Jeremy needs to know. Always, on any join intent.
    //   • pauseAi — JAI must STOP TALKING. Only when the reply itself was
    //     untrustworthy, i.e. a price outside the rate card.
    // A join question is now answered and Jeremy is pinged; it no longer
    // silences JAI for that customer for good.
    const joinEscalation = esc?.escalation === "JOIN_INTENT";
    // The rule is: whenever JAI REFUSES and hands over, it stops talking;
    // whenever it ANSWERS, it keeps talking. So a promo ask and a binned reply
    // both pause — JAI must not be pressed into guessing a figure it does not
    // have while Jeremy is closing — and an answered "how do I join" does not.
    // That is the case that was muting the warmest leads for good.
    // Isaac, 2026-10-12: of the new guards only an explicit request for a person
    // pauses; reschedules and live-availability claims alert Jeremy and JAI keeps
    // answering (2026-07-25: "dont leave the lead hanging").
    const pauseAi = priceLeak || promoHandoff || (humanTakeover && !rescheduleAsk);

    // ── Dead adult-trial-link guard (last line of defence) ─────────────────
    // The adult trial Calendly link was switched OFF on 2026-07-30 and is DEAD —
    // the page reads "not valid". jai-facts.ts / jai-reply.ts tell the model
    // NEVER to send it, but on 2026-08-01 DeepSeek sent it to an adult beginner
    // anyway and she got "unable to access". Same failure class as the $252 promo
    // incident: never trust the model to obey "never send X". If the dead adult
    // link slipped into the reply, replace it with the correct paused-adult + $42
    // drop-in answer (a USEFUL reply, not the generic handoff) and page Coach
    // Jeremy to follow up. Kids/pre-teen Calendly links are LIVE and pass through
    // untouched — hasDeadAdultLink ignores the "kids-*" slugs.
    if (hasDeadAdultLink(outText)) {
      console.warn(
        "[jai-webhook] blocked dead adult trial link in outbound, replaced + escalated"
      );
      outText = PAUSED_ADULT_TRIAL_TEXT;
      outQuick = [];
      if (!esc || esc.escalation === "GENERAL_ESCALATION") {
        esc = {
          escalation: "GENERAL_ESCALATION",
          intent: "dead_adult_link_blocked",
          source: "guard",
        };
      }
    }

    // Learned member detection — once the bot recognises an existing member, remember it.
    if (member && !lead?.is_member) {
      await sb.from("leads").update({ is_member: true }).eq("contact_number", from);
    }

    await sb.from("conversations").insert({
      contact_number: from,
      contact_name: contactName,
      role: "assistant",
      message: outText,
      via: "bot",
    });

    // Label the outbound so the customer sees who's replying (ConnectLah-style).
    // WA interactive (button) messages cap the body at 1024 chars and can fail
    // for other reasons — never let the buttons cost the customer the message:
    // long bodies go as plain text, and a failed interactive send falls back.
    const outbound = `*Jai*\n${outText}`;
    let delivered: boolean;
    if (outQuick.length > 0 && outbound.length <= 1000) {
      delivered = await sendQuickReplies(from, outbound, outQuick);
      if (!delivered) delivered = await sendText(from, outbound);
    } else {
      delivered = await sendText(from, outbound);
    }

    // Reply delivered → NOW mark the message handled so Meta retries dedup.
    // (Before this point any crash/timeout leaves handled=false → we re-reply.)
    if (delivered) {
      await markPublicLeadContacted();
      await markHandled();
    }

    // A fail-safe handoff pauses JAI so it cannot talk over Jeremy or keep
    // making unsupported operational promises. This uses the same interlock as
    // the WA inbox "Jeremy taking over" toggle (jai.leads.ai_paused, see
    // /api/wa-inbox/pause); Jeremy flips it back off from the inbox when done.
    // Price/promo guards and an explicit request for a person pause. A plain rate question is still answered
    // without pausing. Jeremy is pinged and receives a pending item below, so a
    // paused chat is a handoff, never silent abandonment.
    if (pauseAi) {
      const pauseSource = priceLeak
        ? "price_guard"
        : promoHandoff
          ? "promo_handoff"
          : "explicit_human_takeover";
      const pauseReason = priceLeak
        ? "JAI blocked a non-standard price and handed the chat to Coach Jeremy"
        : promoHandoff
          ? "Customer asked about a promotion or quoted an unverified price"
          : "Customer asked to speak to Coach Jeremy or a person";
      let { error: pauseErr } = await sb
        .from("leads")
        .update(buildPauseMetadata({
          pausedBy: "jai",
          source: pauseSource,
          reason: pauseReason,
        }))
        .eq("contact_number", from);
      if (pauseErr && isMissingPauseMetadataColumn(pauseErr)) {
        const legacy = await sb
          .from("leads")
          .update({ ai_paused: true })
          .eq("contact_number", from);
        pauseErr = legacy.error;
      }
      if (pauseErr) console.error("[jai-webhook] takeover pause failed", pauseErr);
    }

    // Bot just sent a booking link → arm the silent-lead follow-up funnel
    // (lead-followup cron nudges at +1h and +20h if they stay quiet).
    if (!forceHandoff && /calendly\.com\//i.test(outText)) {
      await sb
        .from("leads")
        .update({
          booking_link_sent_at: new Date().toISOString(),
          followup1_sent_at: null,
          followup2_sent_at: null,
        })
        .eq("contact_number", from);
    }

    // Escalation → ping the gym's master_admin(s) (Jeremy) on Telegram so a
    // PT lead / freeze / complaint / corporate enquiry doesn't fall through.
    if (esc) {
      try {
        const pub = createSbClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: admins } = await pub.from("users").select("id").eq("role", "master_admin");
        const labels: Record<string, string> = {
          PT_LEAD: "PT lead 🥊",
          // Not "JAI paused" any more: a join question is answered and JAI keeps
          // talking, so telling Jeremy to take over makes him reply on top of an
          // answer the customer already has. Only price_blocked still pauses.
          JOIN_INTENT:
            esc?.intent === "price_blocked"
              ? "Quoted a price we don't have 💰 — reply binned, JAI paused, take over"
              : pauseAi
              ? "Wants to join / asked about a promo 💰 — JAI paused, please take over"
              : "Wants to join / asked about a promo 💰 — JAI answered, please confirm",
          CORPORATE: "Corporate / group enquiry",
          COMPLAINT: "Complaint / issue ⚠️",
          TRIAL_BOOKED: "Trial booked ✅",
          TRIAL_CANCEL: "Trial cancelled / reschedule ↩️",
          GENERAL_ESCALATION:
            esc?.intent === "explicit_human_takeover"
              ? "Asked for a person - JAI paused, please take over"
              : esc?.intent === "reschedule_policy_question"
              ? "Asked about rescheduling - nothing changed, please reply"
              : esc?.intent === "reschedule_request"
              ? "Wants to change their booking - NOT changed yet, please move it"
              : esc?.intent === "live_availability_unverified"
              ? "Asked about live availability - JAI could not confirm, please reply"
              : "Needs your attention",
        };

        // Trial cancellation: release the booking so reminders stop and the
        // slot stops showing as expected. Only auto-cancel on an unambiguous
        // single match (same phone tail, future date, still "booked") —
        // anything else is left for Jeremy to resolve from the alert.
        let cancelNote = "";
        if (esc.escalation === "TRIAL_CANCEL") {
          try {
            const tail = from.replace(/\D/g, "").slice(-8);
            const today = new Date(
              new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" })
            );
            const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
            const { data: open } = await pub
              .from("trial_bookings")
              .select("id, name, phone, booking_date, time_slot, calendly_event_uri")
              .eq("status", "booked")
              .gte("booking_date", ymd);
            const matches = (open || []).filter(
              (t) => (t.phone || "").replace(/\D/g, "").slice(-8) === tail
            );
            if (matches.length === 1) {
              await pub
                .from("trial_bookings")
                .update({ status: "cancelled" })
                .eq("id", matches[0].id);
              cancelNote = `Booking ${matches[0].booking_date} ${matches[0].time_slot || ""} marked CANCELLED in JMT OS.\n`;
              // Free the slot on Calendly too, so someone else can book it.
              if (matches[0].calendly_event_uri) {
                const freed = await cancelCalendlyEvent(
                  matches[0].calendly_event_uri,
                  "Cancelled by the customer via WhatsApp (JAI, JMT AI assistant)"
                );
                cancelNote += freed
                  ? "Calendly slot freed ✅\n"
                  : "⚠️ Couldn't cancel on Calendly — please free the slot manually.\n";
              }
            } else {
              cancelNote = `Could not auto-match a booking (${matches.length} candidates) — please update Trial Management manually.\n`;
            }
          } catch (e) {
            console.error("[jai-webhook] trial cancel update failed", e);
            cancelNote = "Booking update failed — please update Trial Management manually.\n";
          }
        }

        // Never echo an unknown (attacker-controlled) escalation type into the
        // alert. generateReply already drops unknown types, but guard here too:
        // if the key isn't a known label, skip the escalation entirely.
        // Combined messages (e.g. promo + "speak to Jeremy") can pause under another
        // label; never let the alert say JAI is still answering when it is not.
        const baseLabel = labels[esc.escalation];
        const label = pauseAi && baseLabel && !/paused/i.test(baseLabel) ? `${baseLabel} - JAI paused, take over` : baseLabel;
        if (!label) {
          console.warn("[jai-webhook] dropping unknown escalation type", esc.escalation);
          return NextResponse.json({ ok: true });
        }
        // 🛑 Say which language she writes in, in English, before quoting her.
        // On 15 Sep Coach Jeremy was handed a Mandarin PT lead as
        //   PT lead 🥊 — "1对1的价钱 大概多少"
        // and he does not read Chinese, so the only substantive part of the
        // alert was unreadable to its only reader. Isaac had to pick the thread
        // up by hand. We do not translate here — a model call in the webhook is
        // another thing that can fail while a customer waits — but naming the
        // language tells whoever reads it to loop Isaac in, which is the actual
        // decision. (JAI does not know which coach speaks what: there is no
        // language field on coach_profiles.)
        const leadLang = detectLang(text);
        const langNote =
          leadLang === "zh"
            ? `⚠️ Writes in CHINESE — Isaac is the only coach who reads it.\n`
            : "";
        const alert =
          `🔔 JAI — ${label}\n` +
          `Customer: ${contactName || "Unknown"} (+${from})\n` +
          langNote +
          (esc.intent ? `Intent: ${esc.intent}\n` : "") +
          `Last message: "${text}"\n` +
          cancelNote +
          `\nReply in the WA INBOX (JMT OS).`;
        for (const a of admins || []) {
          await sendTelegramPlainToUser(a.id, alert, "jai-escalation");
        }

        // One exception, Isaac 2026-10-12: a customer who explicitly asks for a
        // person pauses JAI (pauseAi above). Everything else below still holds.
        // Escalation NEVER auto-pauses JAI (Isaac, 2026-07-25: "once it is
        // escalate to jeremy, JAI still answering the lead ... dont leave the
        // lead hanging"). Previously COMPLAINT and GENERAL_ESCALATION set
        // ai_paused, which silently ghosted the customer until Jeremy noticed —
        // the same failure that lost a 4-child enquiry on 2026-07-25.
        // Jeremy still owns the thread via the Telegram alert + the pending-items
        // task below, and can fully silence any chat by hand with the
        // "Jeremy taking over" toggle in the WA inbox (jai.leads.ai_paused).
        // Extends the 2026-07-16 PT_LEAD / CORPORATE rule to every escalation type.

        // Also raise a follow-up task on Jeremy's pending-items board so the
        // escalation isn't just a fleeting Telegram alert. De-dupe: skip if an
        // open jai_escalation for this contact was already raised in the last
        // few hours. Own try/catch — a task hiccup must not affect the alert.
        try {
          const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
          let taskQuery = pub
            .from("admin_pending_items")
            .select("id")
            .eq("category", "jai_escalation")
            .eq("status", "open")
            .ilike("link", `%contact=${from}`)
            .gte("created_at", cutoff);
          // A join/money escalation must never be swallowed by an unrelated
          // open item (e.g. a PT lead from an hour ago) — dedupe it only
          // against other join escalations for the same contact.
          // Match on the label's stem (before " — "), so the paused and answered
          // variants of the same join alert dedupe against each other.
          if (joinEscalation) taskQuery = taskQuery.ilike("description", `${label.split(" — ")[0]}%`);
          const { data: existingTask } = await taskQuery.limit(1);
          const who = contactName || `+${from}`;
          const preview = text.length > 200 ? text.slice(0, 197) + "..." : text;
          const description =
            (leadLang === "zh" ? "[CHINESE — ask Isaac] " : "") +
            `${label} — "${preview}"` +
            (esc.intent ? ` (intent: ${esc.intent})` : "");
          if (!existingTask || existingTask.length === 0) {
            await pub.from("admin_pending_items").insert({
              id: globalThis.crypto?.randomUUID?.() ?? `jai-${from}-${Date.now()}`,
              title: `JAI: ${who} needs Jeremy`,
              description,
              category: "jai_escalation",
              link: `https://jmtos.ionicx.ai/wa-inbox?contact=${from}`,
              priority:
                esc.escalation === "COMPLAINT" || esc.escalation === "JOIN_INTENT"
                  ? "high"
                  : "medium",
              status: "open",
            });
          } else {
            // 🛑 De-dupe by UPDATING, not by dropping the newer message.
            // Vivi@n's card was raised at 15:13 quoting "1对1的价钱 大概多少"
            // (how much is 1-to-1). She stated her actual goal — 减重减脂,
            // losing weight and fat — at 15:14, one minute later. The old code
            // saw an open card and skipped, so the goal never reached the card
            // and Jeremy opened a strictly worse summary than JAI already had.
            // The whole point of the card is to be the freshest thing he reads.
            await pub
              .from("admin_pending_items")
              .update({ description })
              .eq("id", existingTask[0].id);
          }
        } catch (e) {
          console.error("[jai-webhook] escalation task create failed", e);
        }
      } catch (e) {
        console.error("[jai-webhook] escalation notify failed", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[jai-webhook] error", err);
    return NextResponse.json({ ok: true }); // always ack so Meta doesn't hammer retries
  }
}
