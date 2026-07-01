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
      .select("ai_paused")
      .eq("contact_number", from)
      .maybeSingle();
    if (lead?.ai_paused) return NextResponse.json({ ok: true });

    const history = [...(prior || []), { role: "user" as const, message: text }];
    const { messageText, quickReplies, escalation } = await generateReply(history, isNewContact, contactName);

    await sb.from("conversations").insert({
      contact_number: from,
      contact_name: contactName,
      role: "assistant",
      message: messageText,
    });

    if (quickReplies.length > 0) {
      await sendQuickReplies(from, messageText, quickReplies);
    } else {
      await sendText(from, messageText);
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
          GENERAL_ESCALATION: "Needs your attention",
        };
        const label = labels[escalation.escalation] || escalation.escalation;
        const alert =
          `🔔 JAI bot — ${label}\n` +
          `Customer: ${contactName || "Unknown"} (+${from})\n` +
          (escalation.intent ? `Intent: ${escalation.intent}\n` : "") +
          `Last message: "${text}"\n\n` +
          `Reply in the WA INBOX (JMT OS).`;
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
