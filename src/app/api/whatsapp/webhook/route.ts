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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_TOKEN = () => (process.env.WA_VERIFY_TOKEN || "jai_muay_thai_verify").trim();

// ── Handshake ────────────────────────────────────────────────────────────────
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = (p.get("hub.verify_token") || "").trim();
  const challenge = p.get("hub.challenge") || "";
  if (mode === "subscribe" && token && token === VERIFY_TOKEN()) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// ── Inbound message ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
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

    markRead(messageId).catch(() => {});

    // Jeremy has taken over this chat from the inbox → stay quiet (still logged above).
    const { data: lead } = await sb
      .from("leads")
      .select("ai_paused, is_member")
      .eq("contact_number", from)
      .maybeSingle();
    if (lead?.ai_paused) return NextResponse.json({ ok: true });

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
              .select("id, name, phone, booking_date, time_slot")
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
