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
import { buildDeterministicAnswer, lateArrivalAnswer } from "@/lib/wa/deterministic-answers";
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
  PAUSED_ADULT_TRIAL_TEXT,
} from "@/lib/wa/join-intent";
import { sessionBotReplyCount } from "@/lib/wa/session-window";
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

    // They replied — disarm the silent-lead follow-up funnel (re-arms if the
    // bot sends another booking link below).
    await sb
      .from("leads")
      .update({ booking_link_sent_at: null, followup1_sent_at: null, followup2_sent_at: null })
      .eq("contact_number", from)
      .not("booking_link_sent_at", "is", null);

    markRead(messageId).catch(() => {});

    // Jeremy has taken over this chat from the inbox → stay quiet (still logged above).
    const { data: lead } = await sb
      .from("leads")
      .select("ai_paused, is_member, contact_name")
      .eq("contact_number", from)
      .maybeSingle();

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
        const status = lead?.ai_paused
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

    if (lead?.ai_paused) {
      // Handling is complete: logged + intentional silence (Jeremy owns this
      // chat). No reply is owed, so it's safe to mark handled and dedup retries.
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
        await sendText(from, `*Jai*\n${out}`);
        await markHandled(); // reply delivered → safe to dedup retries
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
      const bookings = await findBookingsByHint(pub, text);
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
        await sendText(from, `*Jai*\n${late.messageText}`);
        await markHandled(); // reply delivered → safe to dedup retries
        return NextResponse.json({ ok: true });
      }
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
        if (det.quickReplies.length > 0 && out.length <= 1000) {
          const ok = await sendQuickReplies(from, out, det.quickReplies);
          if (!ok) await sendText(from, out);
        } else {
          await sendText(from, out);
        }
        await markHandled(); // reply delivered → safe to dedup retries
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
    const { messageText, quickReplies, escalation, member } = await generateReply(
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
    const dragging = sessionBotCount >= 8;
    const forceHandoff =
      (resendingLink || dragging) &&
      (!escalation || escalation.escalation === "GENERAL_ESCALATION");

    let outText = forceHandoff
      ? "Let me get Coach Jeremy to sort this out for you directly 🙏 He'll reach out to you shortly."
      : messageText;
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
    const answerableJoin = joinHit === "wants_to_join";
    if (joinHit && !answerableJoin) {
      outText = JOIN_HANDOFF_TEXT;
      outQuick = [];
    } else if (answerableJoin && !forceHandoff) {
      // A model-authored button is text nobody guards — hasDisallowedPrice only
      // ever inspects outText. Clearing them was the fourth thing the old
      // moneyHandoff flag did, and it belongs on this side of the split.
      outQuick = [];
      outText = `${outText}\n\n${JOIN_HANDOFF_SUFFIX}`;
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
    const pauseAi = priceLeak || (!!joinHit && !answerableJoin);

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
    if (outQuick.length > 0 && outbound.length <= 1000) {
      const ok = await sendQuickReplies(from, outbound, outQuick);
      if (!ok) await sendText(from, outbound);
    } else {
      await sendText(from, outbound);
    }

    // Reply delivered → NOW mark the message handled so Meta retries dedup.
    // (Before this point any crash/timeout leaves handled=false → we re-reply.)
    await markHandled();

    // Join / promo intent → hand the chat to Jeremy for real: pause JAI on this
    // contact so it can't keep talking over him while he closes, or get pressed
    // into guessing a promo figure it does not have. Same interlock the WA inbox
    // "Jeremy taking over" toggle uses (jai.leads.ai_paused, see
    // /api/wa-inbox/pause) — Jeremy flips it back off from the inbox when done.
    // This is the ONE escalation type that auto-pauses; every other type still
    // leaves JAI answering (2026-07-25 rule, deliberately not changed).
    // Scope narrowed 2026-07-29: only a real commitment to join/pay or a promo
    // ask reaches here. A plain rate question never pauses — it is answered.
    // Jeremy is ALWAYS pinged on Telegram + given a pending item below, so a
    // paused chat is a handoff, never silence.
    if (pauseAi) {
      const { error: pauseErr } = await sb
        .from("leads")
        .update({ ai_paused: true })
        .eq("contact_number", from);
      if (pauseErr) console.error("[jai-webhook] join-intent pause failed", pauseErr);
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
              : "Wants to join / asked about a promo 💰 — JAI answered, please confirm",
          CORPORATE: "Corporate / group enquiry",
          COMPLAINT: "Complaint / issue ⚠️",
          TRIAL_BOOKED: "Trial booked ✅",
          TRIAL_CANCEL: "Trial cancelled / reschedule ↩️",
          GENERAL_ESCALATION: "Needs your attention",
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
        const label = labels[esc.escalation];
        if (!label) {
          console.warn("[jai-webhook] dropping unknown escalation type", esc.escalation);
          return NextResponse.json({ ok: true });
        }
        const alert =
          `🔔 JAI — ${label}\n` +
          `Customer: ${contactName || "Unknown"} (+${from})\n` +
          (esc.intent ? `Intent: ${esc.intent}\n` : "") +
          `Last message: "${text}"\n` +
          cancelNote +
          `\nReply in the WA INBOX (JMT OS).`;
        for (const a of admins || []) {
          await sendTelegramPlainToUser(a.id, alert, "jai-escalation");
        }

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
          if (joinEscalation) taskQuery = taskQuery.ilike("description", `${label}%`);
          const { data: existingTask } = await taskQuery.limit(1);
          if (!existingTask || existingTask.length === 0) {
            const who = contactName || `+${from}`;
            const preview = text.length > 200 ? text.slice(0, 197) + "..." : text;
            await pub.from("admin_pending_items").insert({
              id: globalThis.crypto?.randomUUID?.() ?? `jai-${from}-${Date.now()}`,
              title: `JAI: ${who} needs Jeremy`,
              description:
                `${label} — "${preview}"` +
                (esc.intent ? ` (intent: ${esc.intent})` : ""),
              category: "jai_escalation",
              link: `https://jmtos.ionicx.ai/wa-inbox?contact=${from}`,
              priority:
                esc.escalation === "COMPLAINT" || esc.escalation === "JOIN_INTENT"
                  ? "high"
                  : "medium",
              status: "open",
            });
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
