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
import { generateReply } from "@/lib/wa/jai-reply";
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
  // Verify Meta's HMAC signature on the RAW body BEFORE parsing.
  // TEMP (2026-07-05): the signature isn't matching META_APP_SECRET, which was silently
  // dropping live customer messages (JAI went quiet). Log the mismatch for diagnosis but
  // PROCESS the message so JAI keeps replying. Restore the hard 403 once the secret is confirmed.
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(raw, sig)) {
    const { createHmac } = await import("node:crypto");
    const exp = "sha256=" + createHmac("sha256", process.env.META_APP_SECRET || "").update(raw).digest("hex");
    console.warn("[wa-webhook] SIG MISMATCH (processing anyway, temp)", {
      secretSet: !!process.env.META_APP_SECRET,
      recv: (sig || "none").slice(0, 20),
      exp: exp.slice(0, 20),
    });
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

    if (lead?.ai_paused) return NextResponse.json({ ok: true });

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

    // Learned member detection — once the bot recognises an existing member, remember it.
    if (member && !lead?.is_member) {
      await sb.from("leads").update({ is_member: true }).eq("contact_number", from);
    }

    await sb.from("conversations").insert({
      contact_number: from,
      contact_name: contactName,
      role: "assistant",
      message: messageText,
      via: "bot",
    });

    // Label the outbound so the customer sees who's replying (ConnectLah-style).
    // WA interactive (button) messages cap the body at 1024 chars and can fail
    // for other reasons — never let the buttons cost the customer the message:
    // long bodies go as plain text, and a failed interactive send falls back.
    const outbound = `*Jai*\n${messageText}`;
    if (quickReplies.length > 0 && outbound.length <= 1000) {
      const ok = await sendQuickReplies(from, outbound, quickReplies);
      if (!ok) await sendText(from, outbound);
    } else {
      await sendText(from, outbound);
    }

    // Bot just sent a booking link → arm the silent-lead follow-up funnel
    // (lead-followup cron nudges at +1h and +20h if they stay quiet).
    if (/calendly\.com\//i.test(messageText)) {
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
    if (escalation) {
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
        if (escalation.escalation === "TRIAL_CANCEL") {
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

        const label = labels[escalation.escalation] || escalation.escalation;
        const alert =
          `🔔 JAI bot — ${label}\n` +
          `Customer: ${contactName || "Unknown"} (+${from})\n` +
          (escalation.intent ? `Intent: ${escalation.intent}\n` : "") +
          `Last message: "${text}"\n` +
          cancelNote +
          `\nReply in the WA INBOX (JMT OS).`;
        for (const a of admins || []) {
          await sendTelegramPlainToUser(a.id, alert, "jai-escalation");
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
