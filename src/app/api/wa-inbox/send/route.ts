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
// Cap the whole request so a dead JAI_BOT_SEND_URL can't hang the browser's fetch
// (it used to run with no timeout → route never returned → UI showed "Network error").
export const maxDuration = 30;
const WA_VERSION = "v21.0";
const FETCH_TIMEOUT_MS = 9000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// fetch with an AbortController timeout so a hung endpoint fails fast instead of
// hanging until the platform kills the function.
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Retry transient failures (timeout / network error) a few times with small backoff.
// A non-ok HTTP response is a real rejection from the endpoint — return it, don't retry.
async function postWithRetry(
  url: string,
  init: RequestInit,
  unreachableDetail: string
): Promise<{ ok: boolean; detail?: string; status?: number }> {
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await fetchWithTimeout(url, init);
      if (!r.ok) return { ok: false, status: r.status, detail: await r.text() };
      return { ok: true };
    } catch (e) {
      lastErr = e instanceof Error && e.name === "AbortError" ? "request timed out" : String(e);
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 400);
    }
  }
  return { ok: false, status: 504, detail: `${unreachableDetail} (${lastErr})` };
}

async function deliver(phone: string, text: string): Promise<{ ok: boolean; detail?: string; status?: number }> {
  const botUrl = process.env.JAI_BOT_SEND_URL;
  if (botUrl) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.JAI_SEND_SECRET) headers["x-jai-secret"] = process.env.JAI_SEND_SECRET;
    return postWithRetry(
      botUrl,
      { method: "POST", headers, body: JSON.stringify({ to: phone, text }) },
      "Bot endpoint unreachable"
    );
  }
  const token = process.env.WA_ACCESS_TOKEN;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, status: 500, detail: "WhatsApp not configured yet" };
  return postWithRetry(
    `https://graph.facebook.com/${WA_VERSION}/${phoneId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: text } }),
    },
    "WhatsApp API unreachable"
  );
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

  // Guard: never send manually while JAI is still live for this contact — the
  // bot and the coach would both reply. Require AI paused first (ai_paused lives
  // on the jai.leads row, keyed by contact_number). Don't auto-pause; reject.
  const sbGuard = createJaiClient();
  const { data: leadState } = await sbGuard
    .from("leads")
    .select("ai_paused")
    .eq("contact_number", phone)
    .maybeSingle();
  if (!leadState?.ai_paused) {
    return NextResponse.json(
      { error: "Turn AI off for this contact before sending manually." },
      { status: 409 }
    );
  }

  // Label the outbound so the customer sees it's the real coach, not the bot.
  const sent = await deliver(phone, `*Coach Jeremy*\n${body}`);
  if (!sent.ok) {
    console.error("[wa-inbox send] deliver failed", sent.status, sent.detail);
    const status = sent.status ?? 502;
    // Specific, actionable error instead of a generic "send failed" / browser "Network error".
    const error =
      status === 504
        ? sent.detail?.split(" (")[0] || "Endpoint unreachable"
        : status === 500
          ? sent.detail || "WhatsApp not configured"
          : "WhatsApp API rejected";
    return NextResponse.json({ error, detail: sent.detail }, { status });
  }

  const { error } = await createJaiClient()
    .from("conversations")
    .insert({ contact_number: phone, role: "assistant", message: body, via: "human" });
  if (error) console.error("[wa-inbox send] log insert failed", error);

  return NextResponse.json({ ok: true });
}
