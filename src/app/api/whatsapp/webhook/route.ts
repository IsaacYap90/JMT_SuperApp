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
import { extractMessage, isStatusUpdate, sendText, sendQuickReplies, markRead } from "@/lib/wa/jai-send";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { cancelCalendlyEvent } from "@/lib/calendly";
import { verifyMetaSignature } from "@/lib/meta-webhook";
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
    const { data: prior } = await sb
      .from("conversations")
      .select("role, message")
      .eq("contact_number", from)
      .order("created_at", { ascending: true })
      .limit(20);
    const isNewContact = !prior || prior.length === 0;

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
      .select("ai_paused, is_member")
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
      [...(prior || [])].reverse().find((m) => m.role === "assistant")?.message || "";
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

    const history = [...(prior || []), { role: "user" as const, message: text }];
    const { messageText, quickReplies, escalation, member } = await generateReply(
      history,
      isNewContact,
      contactName,
      lead?.is_member ?? false
    );

    // ── Deterministic anti-loop guard ──────────────────────────────────────
    // LLMs ignore "don't repeat" under pressure, so we backstop it in code.
    // If JAI is about to resend a booking link it just sent, or the chat has
    // dragged on with no resolution, hand to Coach Jeremy and go quiet instead
    // of looping the same reply (the 2026-07-09 "looked dumb" failure).
    const priorBot = (prior || []).filter((m) => m.role === "assistant");
    const prevBotMsg = [...priorBot].reverse()[0]?.message || "";
    const resendingLink =
      /calendly\.com\//i.test(messageText) && /calendly\.com\//i.test(prevBotMsg);
    const dragging = priorBot.length >= 8;
    const forceHandoff =
      (resendingLink || dragging) &&
      (!escalation || escalation.escalation === "GENERAL_ESCALATION");

    const outText = forceHandoff
      ? "Let me get Coach Jeremy to sort this out for you directly 🙏 He'll reach out to you shortly."
      : messageText;
    const outQuick = forceHandoff ? [] : quickReplies;
    const esc: Escalation | null = forceHandoff
      ? {
          escalation: "GENERAL_ESCALATION",
          intent: resendingLink ? "loop_break" : "conversation_stuck",
          source: "guard",
        }
      : escalation;

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
                  "Cancelled by the customer via WhatsApp (JAI bot)"
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
          `🔔 JAI bot — ${label}\n` +
          `Customer: ${contactName || "Unknown"} (+${from})\n` +
          (esc.intent ? `Intent: ${esc.intent}\n` : "") +
          `Last message: "${text}"\n` +
          cancelNote +
          `\nReply in the WA INBOX (JMT OS).`;
        for (const a of admins || []) {
          await sendTelegramPlainToUser(a.id, alert, "jai-escalation");
        }

        // A handoff escalation means a human (Coach Jeremy) now owns this chat —
        // pause JAI so it goes quiet instead of looping back into the flow.
        // (Booking/cancel notifications are self-service — don't pause those.)
        const HANDOFF = ["PT_LEAD", "CORPORATE", "COMPLAINT", "GENERAL_ESCALATION"];
        if (HANDOFF.includes(esc.escalation)) {
          await sb.from("leads").update({ ai_paused: true }).eq("contact_number", from);
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
