import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120; // extraction can take a while

type TelegramPhoto = { file_id: string; file_unique_id: string; width: number; height: number };

type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    text?: string;
    photo?: TelegramPhoto[];
    media_group_id?: string;
    caption?: string;
  };
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function sendReply(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function downloadTelegramPhoto(token: string, fileId: string): Promise<Buffer | null> {
  // Get file path from Telegram
  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const fileData = await fileRes.json();
  if (!fileData.ok || !fileData.result?.file_path) return null;

  // Download the file
  const dlRes = await fetch(`https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`);
  if (!dlRes.ok) return null;
  return Buffer.from(await dlRes.arrayBuffer());
}

async function extractContractData(photoBuffers: Buffer[]): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const imageMessages = photoBuffers.map((buf) => ({
    type: "image_url" as const,
    image_url: { url: `data:image/jpeg;base64,${buf.toString("base64")}` },
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract PT (Personal Training) contract details from photos of agreement forms.

Return a SINGLE flat JSON object (NOT an array) with these exact top-level fields. Even when multiple pages are provided, MERGE everything into one object — do not return a per-page array.

Fields:
- client_name: string (full name of the client/member)
- client_phone: string or null (phone number if visible)
- client_nric: string or null (NRIC last 4 digits if visible, e.g. "4534J")
- coach_name: string or null (trainer/coach name)
- total_sessions: number (total PT sessions in the package)
- sessions_used: number (sessions already completed, from attendance record)
- price_per_session: number or null (price per session in SGD)
- total_price: number or null (total package price in SGD)
- payment_method: string or null (e.g. "PayNow", "Cash", "Bank Transfer")
- start_date: string or null (contract start/sign date in YYYY-MM-DD)
- expiry_date: string or null (contract expiry date in YYYY-MM-DD)
- session_dates: string[] (completed session dates in YYYY-MM-DD; union across all pages)

If a field is not visible or unclear, use null.`,
      },
      {
        role: "user",
        content: [
          ...imageMessages,
          { type: "text" as const, text: "Extract all PT contract details from these contract page(s). Return ONE combined JSON object." },
        ],
      },
    ],
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content?.trim() || "{}";
  const cleaned = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  // Defensive: if model still returns array or wraps under a key, unwrap.
  if (Array.isArray(parsed)) {
    const merged: Record<string, unknown> = {};
    for (const page of parsed) {
      if (page && typeof page === "object") {
        for (const [k, v] of Object.entries(page)) {
          if (merged[k] == null && v != null) merged[k] = v;
        }
      }
    }
    return merged;
  }
  return parsed;
}

// ── Handle /start deep-link (existing functionality) ──
async function handleStart(
  token: string,
  chatId: number,
  text: string,
) {
  const supabase = getSupabase();
  if (!supabase) return;

  const parts = text.split(/\s+/);
  const userId = parts[1] || "";

  if (!userId) {
    await sendReply(token, chatId, "Welcome! To link your account, please use the personal link your admin shared with you.");
    return;
  }

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (userErr || !user) {
    await sendReply(token, chatId, "Sorry, I couldn't find your account. Please check with your admin.");
    return;
  }

  if (!["coach", "admin", "master_admin"].includes(user.role)) {
    await sendReply(token, chatId, "Telegram alerts are only available for coaches and admins.");
    return;
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({ telegram_chat_id: String(chatId) })
    .eq("id", userId);

  if (updateErr) {
    await sendReply(token, chatId, "Something went wrong linking your account. Please try again.");
    return;
  }

  await sendReply(token, chatId, `Linked! Hey ${user.full_name}, you'll now receive JMT alerts here.`);
  console.log(`[telegram-webhook] linked ${user.full_name} (${userId}) → chat ${chatId}`);
}

// ── Handle photo upload ──
async function handlePhoto(
  token: string,
  chatId: number,
  telegramUserId: number,
  photos: TelegramPhoto[],
  mediaGroupId?: string
) {
  const supabase = getSupabase();
  if (!supabase) return;

  // Verify sender is an admin by matching telegram_chat_id
  const { data: sender } = await supabase
    .from("users")
    .select("id, role, full_name")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();

  if (!sender || !["admin", "master_admin", "coach"].includes(sender.role)) {
    await sendReply(token, chatId, "Only admins can upload PT contracts.");
    return;
  }

  // Use media_group_id as batch_id, or generate a new one for standalone photos
  const batchId = mediaGroupId || randomUUID();

  // Pick the highest resolution photo (last in the array)
  const bestPhoto = photos[photos.length - 1];

  // Save photo record
  const { error: insertErr } = await supabase.from("pt_contract_photos").insert({
    telegram_file_id: bestPhoto.file_id,
    batch_id: batchId,
    uploaded_by_telegram_id: String(telegramUserId),
  });
  if (insertErr) {
    console.error("[telegram-webhook] photo insert error:", insertErr);
    await sendReply(token, chatId, "Failed to save photo. Please try again.");
    return;
  }

  // Count photos in this batch
  const { count } = await supabase
    .from("pt_contract_photos")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batchId);

  // Only reply once per standalone photo (not for media groups — they'd flood)
  if (!mediaGroupId) {
    await sendReply(token, chatId, `📸 Got it (1 page). Send more pages or /extract when ready.`);
  } else if (count === 1) {
    // First photo in a media group — send one reply
    await sendReply(token, chatId, `📸 Receiving contract pages... Send /extract when all pages are uploaded.`);
  }
}

// ── Handle /extract command ──
async function handleExtract(token: string, chatId: number, telegramUserId: number) {
  const supabase = getSupabase();
  if (!supabase) return;

  // Verify sender is admin
  const { data: sender } = await supabase
    .from("users")
    .select("id, role, full_name")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();

  if (!sender || !["admin", "master_admin", "coach"].includes(sender.role)) {
    await sendReply(token, chatId, "Only admins can extract contracts.");
    return;
  }

  // Get all unprocessed photos (photos not yet linked to a draft)
  // Find batches that don't have a draft yet
  const { data: photos } = await supabase
    .from("pt_contract_photos")
    .select("*")
    .eq("uploaded_by_telegram_id", String(telegramUserId))
    .order("created_at", { ascending: true });

  if (!photos || photos.length === 0) {
    await sendReply(token, chatId, "No contract photos found. Send photos first, then /extract.");
    return;
  }

  // Check which batches already have drafts
  const batchIds = Array.from(new Set(photos.map((p) => p.batch_id)));
  const { data: existingDrafts } = await supabase
    .from("pt_contract_drafts")
    .select("batch_id")
    .in("batch_id", batchIds);

  const processedBatches = new Set((existingDrafts || []).map((d) => d.batch_id));
  const unprocessedPhotos = photos.filter((p) => !processedBatches.has(p.batch_id));

  if (unprocessedPhotos.length === 0) {
    await sendReply(token, chatId, "All uploaded contracts have been processed. Send new photos to extract another.");
    return;
  }

  await sendReply(token, chatId, `🔍 Processing ${unprocessedPhotos.length} page(s)... This may take a moment.`);

  try {
    // Download all photos
    const photoBuffers: Buffer[] = [];
    for (const photo of unprocessedPhotos) {
      const buf = await downloadTelegramPhoto(token, photo.telegram_file_id);
      if (buf) photoBuffers.push(buf);
    }

    if (photoBuffers.length === 0) {
      await sendReply(token, chatId, "Failed to download photos. Please try uploading again.");
      return;
    }

    // Extract data using AI
    const extracted = await extractContractData(photoBuffers);

    // Try to match coach_name to a coach in the system
    let coachId: string | null = null;
    if (extracted.coach_name) {
      const { data: coaches } = await supabase
        .from("users")
        .select("id, full_name")
        .in("role", ["coach", "admin", "master_admin"]);

      if (coaches) {
        const name = (extracted.coach_name as string).toLowerCase();
        const match = coaches.find(
          (c) => c.full_name && c.full_name.toLowerCase().includes(name) || name.includes(c.full_name?.toLowerCase() || "")
        );
        if (match) coachId = match.id;
      }
    }

    // Use first unprocessed batch_id as the draft batch_id
    const draftBatchId = unprocessedPhotos[0].batch_id;

    // Save draft
    const { data: draft, error: draftErr } = await supabase
      .from("pt_contract_drafts")
      .insert({
        batch_id: draftBatchId,
        client_name: extracted.client_name || null,
        client_phone: extracted.client_phone || null,
        client_nric: extracted.client_nric || null,
        coach_name: extracted.coach_name || null,
        coach_id: coachId,
        total_sessions: extracted.total_sessions || null,
        sessions_used: extracted.sessions_used || 0,
        price_per_session: extracted.price_per_session || null,
        total_price: extracted.total_price || null,
        payment_method: extracted.payment_method || null,
        start_date: extracted.start_date || null,
        expiry_date: extracted.expiry_date || null,
        session_dates: extracted.session_dates || [],
        raw_extraction: extracted,
        status: "draft",
        uploaded_by_telegram_id: String(telegramUserId),
      })
      .select()
      .single();

    if (draftErr) {
      console.error("[telegram-webhook] draft insert error:", draftErr);
      await sendReply(token, chatId, "Failed to save extracted data. Please try again.");
      return;
    }

    // Build summary message
    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dashboard-isaacs-projects-14fce6f6.vercel.app";
    const lines = [
      `✅ Contract extracted!`,
      ``,
      `👤 Client: ${extracted.client_name || "—"}`,
      `📞 Phone: ${extracted.client_phone || "—"}`,
      `🏋️ Coach: ${extracted.coach_name || "—"}`,
      `📦 Package: ${extracted.total_sessions || "?"} sessions`,
      `✅ Used: ${extracted.sessions_used || 0}`,
      `💰 Total: $${extracted.total_price || "?"}`,
      `📅 Expiry: ${extracted.expiry_date || "—"}`,
      ``,
      `Review & save on the dashboard:`,
      `${dashboardUrl}/pt?draft=${draft.id}`,
    ];

    await sendReply(token, chatId, lines.join("\n"));
  } catch (err) {
    console.error("[telegram-webhook] extraction error:", err);
    await sendReply(
      token,
      chatId,
      `Failed to extract contract data: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.JMT_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "no bot token" }, { status: 500 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const msg = update.message;
  if (!msg) {
    return NextResponse.json({ ok: true, skipped: "no message" });
  }

  const chatId = msg.chat.id;
  const telegramUserId = msg.from?.id || 0;

  // Handle photo uploads
  if (msg.photo && msg.photo.length > 0) {
    await handlePhoto(token, chatId, telegramUserId, msg.photo, msg.media_group_id);
    return NextResponse.json({ ok: true, action: "photo_received" });
  }

  // Handle text commands
  const text = msg.text?.trim() || msg.caption?.trim() || "";

  if (text.startsWith("/start")) {
    await handleStart(token, chatId, text);
    return NextResponse.json({ ok: true, action: "start" });
  }

  if (text === "/extract") {
    await handleExtract(token, chatId, telegramUserId);
    return NextResponse.json({ ok: true, action: "extract" });
  }

  // Unknown message — ignore
  return NextResponse.json({ ok: true, skipped: "unhandled" });
}
