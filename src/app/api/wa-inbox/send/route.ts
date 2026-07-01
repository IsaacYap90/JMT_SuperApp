// POST /api/wa-inbox/send { phone, body } — master_admin only.
// Sends a WhatsApp text + logs it into jai.conversations as role='assistant'.
// Delivery: JAI_BOT_SEND_URL (preferred, the bot's /api/send) else Meta Cloud API
// (WA_PHONE_NUMBER_ID + WA_ACCESS_TOKEN). These env vars get set when the bot/WABA
// goes live; until then send returns a clear error but reads still work.
import { NextRequest, NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const WA_VERSION = "v21.0";

async function deliver(phone: string, text: string): Promise<{ ok: boolean; detail?: string; status?: number }> {
  const botUrl = process.env.JAI_BOT_SEND_URL;
  if (botUrl) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.JAI_SEND_SECRET) headers["x-jai-secret"] = process.env.JAI_SEND_SECRET;
    const r = await fetch(botUrl, { method: "POST", headers, body: JSON.stringify({ to: phone, text }) });
    if (!r.ok) return { ok: false, status: r.status, detail: await r.text() };
    return { ok: true };
  }
  const token = process.env.WA_ACCESS_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, status: 500, detail: "WhatsApp not configured yet" };
  const r = await fetch(`https://graph.facebook.com/${WA_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: text } }),
  });
  if (!r.ok) return { ok: false, status: r.status, detail: await r.text() };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let payload: { phone?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phone = (payload.phone || "").replace(/^\+/, "").trim();
  const body = (payload.body || "").trim();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });

  // Label the outbound so the customer sees it's the real coach, not the bot.
  const sent = await deliver(phone, `*Coach Jeremy*\n${body}`);
  if (!sent.ok) {
    console.error("[wa-inbox send] deliver failed", sent.status, sent.detail);
    return NextResponse.json({ error: "WhatsApp send failed", detail: sent.detail }, { status: 502 });
  }

  const { error } = await createJaiClient()
    .from("conversations")
    .insert({ contact_number: phone, role: "assistant", message: body, via: "human" });
  if (error) console.error("[wa-inbox send] log insert failed", error);

  return NextResponse.json({ ok: true });
}
