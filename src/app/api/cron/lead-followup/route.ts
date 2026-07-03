// Silent-lead follow-up — runs every 30 min via Vercel Cron.
//
// When the bot sends a booking link and the lead goes quiet, nudge exactly
// twice (Jeremy-approved 2026-07-02), then go cold:
//   Nudge 1: ≥1h after the link, no reply, no booking.
//   Nudge 2: ≥19h after nudge 1 — final, low pressure. Only sent while the
//            lead's last message is <23h old (inside WhatsApp's 24h reply
//            window); if the window has closed, the lead is marked cold
//            silently and just shows in the WA INBOX.
// Safety: never nudge someone with a booking (some book without tapping
// Done), never during quiet hours (21:00–09:00 SGT), never members, never
// chats Jeremy has taken over (ai_paused).
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createJaiClient } from "@/lib/supabase/jai";
import { firstNameFrom } from "@/lib/wa/jai-reply";
import { sendQuickReplies } from "@/lib/wa/jai-send";
import { findBookingsByPhone } from "@/lib/wa/trial-verify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const HOUR = 3600e3;

function nudge1(first: string, link: string): string {
  return (
    `Hey${first ? ` ${first}` : ""}! Still saving you a spot 🥊 Want me to hold one for this week?\n\n` +
    `Booking takes 1 min: ${link}\n\n` +
    `Rather chat first? Just reply here — happy to help.`
  );
}

function nudge2(first: string): string {
  return (
    `Last check${first ? `, ${first}` : ""} — still keen to try a class? 🙂\n\n` +
    `If now's not the right time, no stress at all. Reply anytime and I'll sort you out 🙏`
  );
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase env vars missing" }, { status: 500 });
  }
  if (!process.env.WA_PHONE_NUMBER_ID || !process.env.WA_ACCESS_TOKEN) {
    return NextResponse.json({ error: "WA env vars missing" }, { status: 500 });
  }

  // Quiet hours: 21:00–09:00 SGT — a nudge due at 11pm goes out after 9am.
  const sg = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const hour = sg.getHours();
  if (hour < 9 || hour >= 21) {
    return NextResponse.json({ ok: true, skipped: "quiet hours" });
  }

  const jai = createJaiClient();
  const pub = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: leads } = await jai
    .from("leads")
    .select("contact_number, contact_name, booking_link_sent_at, followup1_sent_at, is_member, ai_paused")
    .not("booking_link_sent_at", "is", null)
    .is("followup2_sent_at", null)
    .eq("ai_paused", false);

  const now = Date.now();
  let nudged1 = 0;
  let nudged2 = 0;
  let cleared = 0;
  let wentCold = 0;

  for (const lead of leads || []) {
    if (lead.is_member) continue;
    const to = lead.contact_number as string;
    const armedAt = new Date(lead.booking_link_sent_at as string).getTime();

    // Booked already (possibly without tapping Done) → funnel done, clear.
    const booked = await findBookingsByPhone(pub, to);
    if (booked.length > 0) {
      await jai.from("leads").update({ booking_link_sent_at: null, followup1_sent_at: null }).eq("contact_number", to);
      cleared++;
      continue;
    }

    // Safety net: any reply after the link (webhook also clears on inbound).
    const { data: lastUserRows } = await jai
      .from("conversations")
      .select("created_at")
      .eq("contact_number", to)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastUserAt = lastUserRows?.[0] ? new Date(lastUserRows[0].created_at).getTime() : 0;
    if (lastUserAt > armedAt) {
      await jai.from("leads").update({ booking_link_sent_at: null, followup1_sent_at: null }).eq("contact_number", to);
      cleared++;
      continue;
    }

    const first = firstNameFrom(lead.contact_name);

    if (!lead.followup1_sent_at) {
      if (now - armedAt < 1 * HOUR) continue; // not due yet
      // Reuse the exact booking link the bot sent them.
      const { data: linkRows } = await jai
        .from("conversations")
        .select("message")
        .eq("contact_number", to)
        .eq("role", "assistant")
        .ilike("message", "%calendly.com%")
        .order("created_at", { ascending: false })
        .limit(1);
      const link =
        linkRows?.[0]?.message.match(/https:\/\/calendly\.com\/\S+/)?.[0] ||
        "https://calendly.com/jaimuaythaisg/muay-thai-trial-class";
      const text = nudge1(first, link);
      const ok = await sendQuickReplies(to, `*Jai*\n${text}`, ["Done"]);
      if (ok) {
        await jai.from("conversations").insert({
          contact_number: to,
          contact_name: lead.contact_name,
          role: "assistant",
          message: text,
          via: "bot",
        });
        await jai.from("leads").update({ followup1_sent_at: new Date().toISOString() }).eq("contact_number", to);
        nudged1++;
      }
      continue;
    }

    // Nudge 2: ≥19h after nudge 1, only inside the 24h reply window.
    const f1At = new Date(lead.followup1_sent_at as string).getTime();
    if (now - f1At < 19 * HOUR) continue;
    if (lastUserAt && now - lastUserAt < 23 * HOUR) {
      const text = nudge2(first);
      const ok = await sendQuickReplies(to, `*Jai*\n${text}`, ["Done"]);
      if (ok) {
        await jai.from("conversations").insert({
          contact_number: to,
          contact_name: lead.contact_name,
          role: "assistant",
          message: text,
          via: "bot",
        });
        await jai.from("leads").update({ followup2_sent_at: new Date().toISOString() }).eq("contact_number", to);
        nudged2++;
        continue;
      }
    }
    // Window closed (or send failed) → mark cold quietly; visible in WA INBOX.
    await jai.from("leads").update({ followup2_sent_at: new Date().toISOString() }).eq("contact_number", to);
    wentCold++;
  }

  return NextResponse.json({ ok: true, candidates: (leads || []).length, nudged1, nudged2, cleared, wentCold });
}
