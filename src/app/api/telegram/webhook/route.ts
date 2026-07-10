import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { createNotification } from "@/app/actions/notifications";

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
  callback_query?: {
    id: string;
    from?: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

type InlineButton = { text: string; callback_data: string };

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

type SupabaseSR = NonNullable<ReturnType<typeof getSupabase>>;

async function sendReply(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function sendReplyWithKeyboard(
  token: string,
  chatId: number,
  text: string,
  inlineKeyboard: InlineButton[][]
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: { inline_keyboard: inlineKeyboard } }),
  });
}

async function answerCallback(token: string, callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// Edit the confirm message in place. Omitting reply_markup removes the buttons.
async function editMessageText(token: string, chatId: number, messageId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });
}

// ── SGT (Asia/Singapore, +08:00) helpers ──
function sgtToday(): string {
  // YYYY-MM-DD in Singapore time
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Singapore" });
}

function fmtSgt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d
    .toLocaleTimeString("en-US", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" ", "")
    .toLowerCase();
  return `${date}, ${time}`;
}

// Supabase FK joins can come back as a single object or a one-element array
// depending on cardinality (see /jmt-gotchas §3). Normalise before reading.
function nameOf(rel: unknown): string {
  const o = Array.isArray(rel) ? rel[0] : rel;
  return (o as { full_name?: string } | null)?.full_name || "Client";
}

// Look up the Telegram sender and gate by role. Returns null if unlinked or
// not permitted.
async function getSender(
  supabase: SupabaseSR,
  chatId: number,
  roles: string[]
): Promise<{ id: string; role: string; full_name: string } | null> {
  const { data: sender } = await supabase
    .from("users")
    .select("id, role, full_name")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();
  if (!sender || !roles.includes(sender.role)) return null;
  return sender as { id: string; role: string; full_name: string };
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
    .select("id, full_name, role, telegram_chat_id")
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

  // Refuse to re-link an account that's already bound to a DIFFERENT Telegram.
  // The deep-link carries only the raw user id, so without this an attacker who
  // learns a staff member's user id could DM the bot /start <id> and redirect
  // that person's alerts to themselves. Re-linking (e.g. new phone) must be
  // admin-initiated by clearing telegram_chat_id first. Same-device re-link is
  // idempotent and allowed.
  if (user.telegram_chat_id && user.telegram_chat_id !== String(chatId)) {
    await sendReply(token, chatId, "This account is already linked to a Telegram account. If you've changed phones, please ask your admin to reset your link first.");
    console.warn(`[telegram-webhook] refused re-link of ${userId} (already bound) from chat ${chatId}`);
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

// ── PT cancel-by-chat ──
// Jeremy messages the bot "cancel John's PT Thursday 6pm" → we parse it,
// find the matching scheduled session, and confirm before cancelling.

type CancelParse = { client_name: string | null; target_date: string | null; time_hint: string | null };

// Small JSON completion via DeepSeek (the bot's existing LLM — see jai-reply.ts).
// Used for text intent parsing. NOT for the contract-photo extract, which needs
// a vision model (still on gpt-4o).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deepseekJson(system: string, user: string, maxTokens = 300): Promise<any> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not configured");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`deepseek ${res.status}`);
  const j = await res.json();
  return JSON.parse(j.choices?.[0]?.message?.content?.trim() || "{}");
}

async function parseCancelRequest(text: string): Promise<CancelParse> {
  const today = sgtToday();
  const dow = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Singapore", weekday: "long" });

  const parsed = await deepseekJson(
    `You parse a gym admin's request to CANCEL a personal-training (PT) session.
Today in Singapore is ${today} (${dow}).
Return a JSON object with EXACTLY these fields:
- "client_name": the member's name (string), or null if not stated.
- "target_date": the session date as "YYYY-MM-DD", or null if no day/date is stated. Resolve relative words ("today","tonight","tomorrow","thursday","this fri","next mon") to the NEXT upcoming matching date on or after today, in Singapore time.
- "time_hint": the session time as 24-hour "HH:MM", or null if no time stated (e.g. "6pm" -> "18:00").
Only extract; do not guess a name that isn't there.`,
    text,
    200
  );
  return {
    client_name: parsed.client_name || null,
    target_date: parsed.target_date || null,
    time_hint: parsed.time_hint || null,
  };
}

async function handleCancelRequest(token: string, chatId: number, text: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  const sender = await getSender(supabase, chatId, ["admin", "master_admin"]);
  if (!sender) {
    await sendReply(token, chatId, "Only admins can cancel PT sessions here.");
    return;
  }

  let parsed: CancelParse;
  try {
    parsed = await parseCancelRequest(text);
  } catch (err) {
    console.error("[telegram-webhook] cancel parse error:", err);
    await sendReply(token, chatId, "Couldn't read that. Try: cancel John's PT Thursday 6pm");
    return;
  }

  if (!parsed.client_name) {
    await sendReply(token, chatId, "Who's the PT session with? Try: cancel John's PT Thursday 6pm");
    return;
  }

  // Only ever touch upcoming, still-scheduled sessions.
  let query = supabase
    .from("pt_sessions")
    .select(
      "id, scheduled_at, status, coach:users!pt_sessions_coach_id_fkey(full_name), member:users!pt_sessions_member_id_fkey(full_name)"
    )
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });

  if (parsed.target_date) {
    const start = new Date(`${parsed.target_date}T00:00:00+08:00`).toISOString();
    const end = new Date(`${parsed.target_date}T23:59:59+08:00`).toISOString();
    query = query.gte("scheduled_at", start).lte("scheduled_at", end);
  } else {
    // No date given — search upcoming sessions in the next 21 days.
    const nowIso = new Date().toISOString();
    const horizon = new Date(Date.now() + 21 * 86400000).toISOString();
    query = query.gte("scheduled_at", nowIso).lte("scheduled_at", horizon);
  }

  const { data: sessions, error } = await query;
  if (error) {
    console.error("[telegram-webhook] cancel query error:", error);
    await sendReply(token, chatId, "Database error looking up sessions. Please try again.");
    return;
  }

  // Fuzzy name match against the joined member (first-name or substring).
  const name = parsed.client_name.toLowerCase().trim();
  const firstName = name.split(/\s+/)[0];
  let matches = (sessions || []).filter((s) => {
    const m = nameOf(s.member).toLowerCase();
    return m.includes(name) || m.includes(firstName);
  });

  // Narrow by hour if a time was given and it disambiguates.
  if (parsed.time_hint && matches.length > 1) {
    const hh = parsed.time_hint.slice(0, 2);
    const narrowed = matches.filter((s) => {
      const t = new Date(s.scheduled_at).toLocaleTimeString("en-GB", {
        timeZone: "Asia/Singapore",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return t.slice(0, 2) === hh;
    });
    if (narrowed.length) matches = narrowed;
  }

  const forWhen = parsed.target_date ? ` on ${parsed.target_date}` : "";

  if (matches.length === 0) {
    await sendReply(token, chatId, `No scheduled PT session found for "${parsed.client_name}"${forWhen}.`);
    return;
  }

  if (matches.length === 1) {
    const s = matches[0];
    const label = `${nameOf(s.member)} — ${fmtSgt(s.scheduled_at)}`;
    await sendReplyWithKeyboard(
      token,
      chatId,
      `Cancel this PT session?\n\n${label}\nCoach: ${nameOf(s.coach)}`,
      [
        [
          { text: "✅ Yes, cancel", callback_data: `ptx:y:${s.id}` },
          { text: "❌ No", callback_data: "ptx:n" },
        ],
      ]
    );
    return;
  }

  // Multiple candidates — one button per session (cap at 6) so Jeremy picks.
  const rows: InlineButton[][] = matches.slice(0, 6).map((s) => [
    { text: `Cancel: ${nameOf(s.member)} — ${fmtSgt(s.scheduled_at)}`, callback_data: `ptx:y:${s.id}` },
  ]);
  rows.push([{ text: "❌ None / never mind", callback_data: "ptx:n" }]);
  const capped = matches.length > 6 ? ` (showing first 6 of ${matches.length})` : "";
  await sendReplyWithKeyboard(
    token,
    chatId,
    `Found ${matches.length} scheduled session(s) for "${parsed.client_name}"${forWhen}${capped}. Which one?`,
    rows
  );
}

async function handleCancelCallback(
  token: string,
  cb: NonNullable<TelegramUpdate["callback_query"]>
) {
  const cbId = cb.id;
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const data = cb.data || "";
  if (!chatId || !messageId) {
    await answerCallback(token, cbId);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    await answerCallback(token, cbId);
    return;
  }

  const sender = await getSender(supabase, chatId, ["admin", "master_admin"]);
  if (!sender) {
    await answerCallback(token, cbId, "Not authorised.");
    return;
  }

  if (data === "ptx:n") {
    await answerCallback(token, cbId);
    await editMessageText(token, chatId, messageId, "Okay — nothing cancelled.");
    return;
  }

  const m = data.match(/^ptx:y:(.+)$/);
  if (!m) {
    await answerCallback(token, cbId);
    return;
  }
  const sessionId = m[1];

  const { data: session } = await supabase
    .from("pt_sessions")
    .select("id, status, coach_id, scheduled_at, member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    await answerCallback(token, cbId, "Session not found.");
    await editMessageText(token, chatId, messageId, "That session no longer exists.");
    return;
  }

  const memberName = nameOf(session.member);
  const when = fmtSgt(session.scheduled_at as string);

  // Idempotency guard (see /jmt-gotchas §7): only cancel a still-scheduled session.
  if (session.status !== "scheduled") {
    await answerCallback(token, cbId, "Already resolved.");
    await editMessageText(token, chatId, messageId, `Already ${session.status} — ${memberName}, ${when}. No change made.`);
    return;
  }

  // DB-guarded update covers the parallel-tap race the code guard can't.
  const { data: updated, error: updErr } = await supabase
    .from("pt_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();

  if (updErr || !updated) {
    await answerCallback(token, cbId, "Couldn't cancel.");
    await editMessageText(token, chatId, messageId, `Couldn't cancel ${memberName}'s session — it may have just changed. Try again.`);
    return;
  }

  // Notify the coach — reuse the proven notification path + type (matches the
  // dashboard's updateSessionStatus cancellation).
  const coachId = session.coach_id as string | null;
  if (coachId) {
    try {
      await createNotification(
        coachId,
        "class_cancelled",
        "PT Session Cancelled",
        `${sender.full_name} cancelled the PT session with ${memberName} on ${when}.`
      );
    } catch (err) {
      console.error("[telegram-webhook] cancel notify failed:", err);
    }
  }

  await answerCallback(token, cbId, "Cancelled ✅");
  await editMessageText(token, chatId, messageId, `✅ Cancelled — ${memberName}, ${when}. Coach notified, slot freed.`);
}

// ══════════════════════════════════════════════════════════════════════════
// JMT assistant — natural-language commands for Jeremy (admins only).
// Reads answer instantly; every write is confirm-first (inline ✅/❌).
// ══════════════════════════════════════════════════════════════════════════

function sgtDayBounds(ymd: string): { startUtc: string; endUtc: string } {
  return {
    startUtc: new Date(`${ymd}T00:00:00+08:00`).toISOString(),
    endUtc: new Date(`${ymd}T23:59:59+08:00`).toISOString(),
  };
}

function sgtDow(ymd: string): string {
  return new Date(`${ymd}T12:00:00+08:00`)
    .toLocaleDateString("en-US", { timeZone: "Asia/Singapore", weekday: "long" })
    .toLowerCase();
}

function dateLabel(ymd: string): string {
  return new Date(`${ymd}T12:00:00+08:00`).toLocaleDateString("en-GB", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// "18:30:00" | "18:30" -> "6:30pm"
function hhmm(t: string): string {
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m}${ampm}`;
}

async function coachNameMap(supabase: SupabaseSR): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("users")
    .select("id, full_name")
    .in("role", ["coach", "admin", "master_admin"]);
  const m = new Map<string, string>();
  (data || []).forEach((u: { id: string; full_name: string | null }) => m.set(u.id, u.full_name || "Coach"));
  return m;
}

type ScheduledSession = {
  id: string;
  scheduled_at: string;
  status: string;
  coach: unknown;
  member: unknown;
};

// Find still-scheduled PT sessions by member name (+ optional date/time).
// Shared by cancel / reschedule / mark.
async function findScheduledSessions(
  supabase: SupabaseSR,
  parsed: { client_name: string | null; target_date: string | null; time_hint: string | null }
): Promise<ScheduledSession[]> {
  if (!parsed.client_name) return [];

  let query = supabase
    .from("pt_sessions")
    .select(
      "id, scheduled_at, status, coach:users!pt_sessions_coach_id_fkey(full_name), member:users!pt_sessions_member_id_fkey(full_name)"
    )
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });

  if (parsed.target_date) {
    const { startUtc, endUtc } = sgtDayBounds(parsed.target_date);
    query = query.gte("scheduled_at", startUtc).lte("scheduled_at", endUtc);
  } else {
    const nowIso = new Date().toISOString();
    const horizon = new Date(Date.now() + 21 * 86400000).toISOString();
    query = query.gte("scheduled_at", nowIso).lte("scheduled_at", horizon);
  }

  const { data: sessions } = await query;
  const name = parsed.client_name.toLowerCase().trim();
  const firstName = name.split(/\s+/)[0];
  let matches = ((sessions || []) as ScheduledSession[]).filter((s) => {
    const m = nameOf(s.member).toLowerCase();
    return m.includes(name) || m.includes(firstName);
  });

  if (parsed.time_hint && matches.length > 1) {
    const hh = parsed.time_hint.slice(0, 2);
    const narrowed = matches.filter((s) => {
      const t = new Date(s.scheduled_at).toLocaleTimeString("en-GB", {
        timeZone: "Asia/Singapore",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return t.slice(0, 2) === hh;
    });
    if (narrowed.length) matches = narrowed;
  }
  return matches;
}

type Intent = {
  intent: string;
  person: string | null;
  coach: string | null;
  target_date: string | null;
  time_hint: string | null;
  new_date: string | null;
  new_time: string | null;
  mark: "completed" | "no_show" | null;
  decision: "approve" | "reject" | null;
  class_name: string | null;
};

async function classifyIntent(text: string): Promise<Intent> {
  const today = sgtToday();
  const dow = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Singapore", weekday: "long" });

  const p = await deepseekJson(
    `You are the intent parser for a Muay Thai gym admin assistant on Telegram. The admin writes in English or Chinese. Today in Singapore is ${today} (${dow}).
Return a JSON object with these fields:
- "intent": one of:
  READS: "schedule_today" (view the class TIMETABLE for a day — "what classes", "the schedule", "who's teaching"), "pt_today" (view PT sessions on a day), "leaves" (who is on leave / pending leave requests), "pt_package" (a member's remaining PT sessions), "leads" (new/recent enquiry leads), "trials_today" (trial bookings), "morning_brief" (overall summary of the day).
  ACTIONS: "pt_create" (BOOK/SCHEDULE/SET UP a NEW PT session for a member with a coach — e.g. "schedule PT with Hazel for Isaac tomorrow 10am", "book a PT for John with coach Ali fri 6pm", "add a PT session"), "pt_cancel" (cancel a PT session), "pt_reschedule" (MOVE an existing PT session to a new time), "pt_mark" (mark a PT session completed or no-show), "leave_review" (approve or reject a coach's leave), "class_cancel" (cancel a group class occurrence).
  "help" if they ask what you can do. "unknown" if none fit.
- CRITICAL: "schedule" as a VERB ("schedule/book a PT", "schedule PT with X") = pt_create. "schedule" as a NOUN ("the schedule", "today's schedule", "what's the schedule") = schedule_today. If a PT session + a person is being set up for a future time, it's pt_create, NOT schedule_today.
- "person": for pt_create the MEMBER/client's name (the person receiving the session); otherwise the member or coach name mentioned; else null.
- "coach": for pt_create, the COACH/trainer's name; else null.
- pt_create name rule: if a name is marked with the word "coach" (e.g. "coach Ali", "with coach Ali"), THAT is the coach and the OTHER name is the member. If NO "coach" keyword, then in "PT with A for B" treat A (after "with") as the member and B (after "for") as the coach. Never put the same name in both.
- "target_date": "YYYY-MM-DD" for the day referred to (existing session/class/leave day, OR the NEW PT session's day for pt_create), resolving "today"/"tomorrow"/"thursday"/"this fri" to the next matching date on/after today in Singapore; null if none.
- "time_hint": the session time as 24h "HH:MM" (e.g. "6pm"->"18:00") — for pt_create this is the new session's time; else null.
- "new_date": for pt_reschedule, the NEW date "YYYY-MM-DD", else null.
- "new_time": for pt_reschedule, the NEW time 24h "HH:MM", else null.
- "mark": for pt_mark, "completed" or "no_show", else null.
- "decision": for leave_review, "approve" or "reject", else null.
- "class_name": for class_cancel or a schedule filter, the class name, else null.
Only extract what is stated. Do not invent names.`,
    text,
    250
  );
  return {
    intent: p.intent || "unknown",
    person: p.person || null,
    coach: p.coach || null,
    target_date: p.target_date || null,
    time_hint: p.time_hint || null,
    new_date: p.new_date || null,
    new_time: p.new_time || null,
    mark: p.mark || null,
    decision: p.decision || null,
    class_name: p.class_name || null,
  };
}

// ── READ handlers ──

async function replySchedule(token: string, chatId: number, supabase: SupabaseSR, ymd: string) {
  const dow = sgtDow(ymd);
  const { data: cancelledRows } = await supabase
    .from("class_sessions")
    .select("class_id")
    .eq("session_date", ymd)
    .eq("status", "cancelled");
  const cancelled = new Set((cancelledRows || []).map((r: { class_id: string }) => r.class_id));

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, start_time, end_time, lead_coach_id, assistant_coach_id, class_coaches(coach_id)")
    .or(`day_of_week.eq.${dow},event_date.eq.${ymd}`)
    .eq("is_active", true)
    .order("start_time");

  const active = (classes || []).filter((c: { id: string }) => !cancelled.has(c.id));
  if (!active.length) {
    await sendReply(token, chatId, `No classes scheduled for ${dateLabel(ymd)}.`);
    return;
  }
  const names = await coachNameMap(supabase);
  const lines = active.map(
    (c: { name: string; start_time: string; end_time: string; lead_coach_id: string | null; assistant_coach_id: string | null }) => {
      const coaches = [c.lead_coach_id, c.assistant_coach_id]
        .filter((id): id is string => !!id)
        .map((id) => names.get(id) || "Coach")
        .join(" + ") || "no coach set";
      return `• ${hhmm(c.start_time)}–${hhmm(c.end_time)}  ${c.name}  (${coaches})`;
    }
  );
  await sendReply(token, chatId, `📅 Classes — ${dateLabel(ymd)}\n\n${lines.join("\n")}`);
}

async function replyPtToday(token: string, chatId: number, supabase: SupabaseSR, ymd: string) {
  const { startUtc, endUtc } = sgtDayBounds(ymd);
  const { data } = await supabase
    .from("pt_sessions")
    .select("scheduled_at, coach:users!pt_sessions_coach_id_fkey(full_name), member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("status", "scheduled")
    .gte("scheduled_at", startUtc)
    .lte("scheduled_at", endUtc)
    .order("scheduled_at");
  if (!data || !data.length) {
    await sendReply(token, chatId, `No PT sessions scheduled for ${dateLabel(ymd)}.`);
    return;
  }
  const lines = (data as { scheduled_at: string; coach: unknown; member: unknown }[]).map(
    (s) => `• ${fmtSgt(s.scheduled_at).split(", ")[1]}  ${nameOf(s.member)}  (${nameOf(s.coach)})`
  );
  await sendReply(token, chatId, `🏋️ PT sessions — ${dateLabel(ymd)}\n\n${lines.join("\n")}`);
}

async function replyLeaves(token: string, chatId: number, supabase: SupabaseSR) {
  const { data: pending } = await supabase
    .from("leaves")
    .select("coach_id, leave_date, leave_end_date, leave_type, is_half_day, coach:users!leaves_coach_id_fkey(full_name)")
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("leave_date");

  const todayYmd = sgtToday();
  const in7 = new Date(Date.now() + 7 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Singapore" });
  const { data: approved } = await supabase
    .from("leaves")
    .select("leave_date, leave_end_date, leave_type, is_half_day, coach:users!leaves_coach_id_fkey(full_name)")
    .eq("status", "approved")
    .is("deleted_at", null)
    .lte("leave_date", in7)
    .gte("leave_end_date", todayYmd)
    .order("leave_date");

  const parts: string[] = [];
  if (pending && pending.length) {
    parts.push(
      "⏳ Pending approval:\n" +
        pending
          .map(
            (l: { leave_date: string; leave_end_date: string; leave_type: string; is_half_day: boolean; coach: unknown }) =>
              `• ${nameOf(l.coach)} — ${dateLabel(l.leave_date)}${l.leave_end_date !== l.leave_date ? "–" + dateLabel(l.leave_end_date) : ""} (${l.leave_type}${l.is_half_day ? ", half day" : ""})`
          )
          .join("\n") +
        "\n(reply \"approve [name]'s leave\" or \"reject …\")"
    );
  }
  if (approved && approved.length) {
    parts.push(
      "✅ Approved (this week):\n" +
        approved
          .map(
            (l: { leave_date: string; leave_end_date: string; leave_type: string; is_half_day: boolean; coach: unknown }) =>
              `• ${nameOf(l.coach)} — ${dateLabel(l.leave_date)}${l.leave_end_date !== l.leave_date ? "–" + dateLabel(l.leave_end_date) : ""} (${l.leave_type}${l.is_half_day ? ", half day" : ""})`
          )
          .join("\n")
    );
  }
  await sendReply(token, chatId, parts.length ? parts.join("\n\n") : "No pending or upcoming leaves. 👍");
}

async function replyPtPackage(token: string, chatId: number, supabase: SupabaseSR, person: string | null) {
  if (!person) {
    await sendReply(token, chatId, "Whose package? Try: how many PT sessions does John have left");
    return;
  }
  const name = person.toLowerCase().trim();
  const { data: members } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("role", "member")
    .is("merged_into_id", null);
  const match = (members || []).find(
    (u: { full_name: string | null }) => (u.full_name || "").toLowerCase().includes(name)
  );
  if (!match) {
    await sendReply(token, chatId, `No member found matching "${person}".`);
    return;
  }
  const { data: pkg } = await supabase
    .from("pt_packages")
    .select("total_sessions, sessions_used, status, expiry_date")
    .eq("user_id", match.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pkg) {
    await sendReply(token, chatId, `${match.full_name} has no active PT package.`);
    return;
  }
  const left = pkg.total_sessions - pkg.sessions_used;
  const exp = pkg.expiry_date ? ` · expires ${dateLabel(pkg.expiry_date)}` : "";
  await sendReply(token, chatId, `📦 ${match.full_name}: ${left} of ${pkg.total_sessions} PT sessions left (${pkg.sessions_used} used)${exp}.`);
}

async function replyLeads(token: string, chatId: number, supabase: SupabaseSR, ymd: string | null) {
  let q = supabase
    .from("leads")
    .select("name, phone, source, status, created_at")
    .order("created_at", { ascending: false });
  if (ymd) {
    const { startUtc, endUtc } = sgtDayBounds(ymd);
    q = q.gte("created_at", startUtc).lte("created_at", endUtc);
  } else {
    q = q.limit(8);
  }
  const { data } = await q;
  if (!data || !data.length) {
    await sendReply(token, chatId, ymd ? `No new leads on ${dateLabel(ymd)}.` : "No leads yet.");
    return;
  }
  const lines = data.map(
    (l: { name: string; phone: string; source: string; status: string }) =>
      `• ${l.name || "—"} (${l.phone || "no phone"}) — ${l.source || "?"} · ${l.status}`
  );
  const head = ymd ? `📇 Leads — ${dateLabel(ymd)}` : "📇 Latest leads";
  await sendReply(token, chatId, `${head}\n\n${lines.join("\n")}`);
}

async function replyTrials(token: string, chatId: number, supabase: SupabaseSR, ymd: string) {
  const { data } = await supabase
    .from("trial_bookings")
    .select("name, phone, programme, time_slot, class:classes(name)")
    .eq("booking_date", ymd)
    .eq("status", "booked")
    .order("time_slot");
  if (!data || !data.length) {
    await sendReply(token, chatId, `No trials booked for ${dateLabel(ymd)}.`);
    return;
  }
  const lines = data.map(
    (t: { name: string; phone: string; programme: string | null; time_slot: string | null; class: unknown }) =>
      `• ${t.time_slot || "—"}  ${t.name} (${t.phone || "no phone"})${t.programme ? " · " + t.programme : ""}`
  );
  await sendReply(token, chatId, `🆕 Trials — ${dateLabel(ymd)}\n\n${lines.join("\n")}`);
}

async function replyMorningBrief(token: string, chatId: number, supabase: SupabaseSR) {
  const ymd = sgtToday();
  const dow = sgtDow(ymd);
  const { startUtc, endUtc } = sgtDayBounds(ymd);

  const [{ data: cancelledRows }, { data: classes }, { data: pt }, { data: trials }, { data: pending }, { data: leadsToday }] =
    await Promise.all([
      supabase.from("class_sessions").select("class_id").eq("session_date", ymd).eq("status", "cancelled"),
      supabase
        .from("classes")
        .select("id, name, start_time, end_time, lead_coach_id, assistant_coach_id")
        .or(`day_of_week.eq.${dow},event_date.eq.${ymd}`)
        .eq("is_active", true)
        .order("start_time"),
      supabase
        .from("pt_sessions")
        .select("scheduled_at, member:users!pt_sessions_member_id_fkey(full_name)")
        .eq("status", "scheduled")
        .gte("scheduled_at", startUtc)
        .lte("scheduled_at", endUtc)
        .order("scheduled_at"),
      supabase.from("trial_bookings").select("name, time_slot").eq("booking_date", ymd).eq("status", "booked"),
      supabase.from("leaves").select("coach:users!leaves_coach_id_fkey(full_name)").eq("status", "pending").is("deleted_at", null),
      supabase.from("leads").select("name").gte("created_at", startUtc).lte("created_at", endUtc),
    ]);

  const cancelled = new Set((cancelledRows || []).map((r: { class_id: string }) => r.class_id));
  const names = await coachNameMap(supabase);
  const classLines = (classes || [])
    .filter((c: { id: string }) => !cancelled.has(c.id))
    .map((c: { name: string; start_time: string; lead_coach_id: string | null }) => `• ${hhmm(c.start_time)} ${c.name}${c.lead_coach_id ? " (" + (names.get(c.lead_coach_id) || "Coach") + ")" : ""}`);

  const parts = [`☀️ Brief — ${dateLabel(ymd)}`, ""];
  parts.push(`📅 Classes (${classLines.length}):`);
  parts.push(classLines.length ? classLines.join("\n") : "• none");
  parts.push("");
  parts.push(`🏋️ PT sessions: ${(pt || []).length}`);
  (pt || []).forEach((s: { scheduled_at: string; member: unknown }) => parts.push(`• ${fmtSgt(s.scheduled_at).split(", ")[1]} ${nameOf(s.member)}`));
  parts.push("");
  parts.push(`🆕 Trials today: ${(trials || []).length}`);
  parts.push(`📇 New leads today: ${(leadsToday || []).length}`);
  parts.push(`⏳ Leave requests pending: ${(pending || []).length}`);
  await sendReply(token, chatId, parts.join("\n"));
}

// ── ACTION request handlers (send confirm buttons) ──

// Resolve a person by (fuzzy) name within the given roles. Active, non-merged.
async function resolveByName(
  supabase: SupabaseSR,
  name: string,
  roles: string[]
): Promise<{ id: string; full_name: string }[]> {
  const { data } = await supabase
    .from("users")
    .select("id, full_name, role")
    .in("role", roles)
    .eq("is_active", true)
    .is("merged_into_id", null);
  const n = name.toLowerCase().trim();
  const first = n.split(/\s+/)[0];
  return ((data || []) as { id: string; full_name: string }[]).filter((u) => {
    const f = (u.full_name || "").toLowerCase();
    return f.includes(n) || f.includes(first);
  });
}

async function requestPtCreate(token: string, chatId: number, supabase: SupabaseSR, intent: Intent) {
  if (!intent.person) {
    await sendReply(token, chatId, "Who's the PT session for? Try: schedule PT with Hazel for coach Isaac tomorrow 10am");
    return;
  }
  if (!intent.coach) {
    await sendReply(token, chatId, `Which coach takes ${intent.person}'s PT? Try: schedule PT with ${intent.person} for coach Isaac tomorrow 10am`);
    return;
  }
  if (!intent.target_date || !intent.time_hint) {
    await sendReply(token, chatId, `What day and time for ${intent.person}'s PT? Try: ...tomorrow 10am`);
    return;
  }

  const members = await resolveByName(supabase, intent.person, ["member"]);
  if (members.length === 0) {
    await sendReply(token, chatId, `Couldn't find a member called "${intent.person}". Add them in the app first, then I can book their PT.`);
    return;
  }
  if (members.length > 1) {
    await sendReply(token, chatId, `Multiple members match "${intent.person}" (${members.slice(0, 4).map((m) => m.full_name).join(", ")}). Be more specific.`);
    return;
  }
  const coaches = await resolveByName(supabase, intent.coach, ["coach", "admin", "master_admin"]);
  if (coaches.length === 0) {
    await sendReply(token, chatId, `Couldn't find a coach called "${intent.coach}".`);
    return;
  }
  if (coaches.length > 1) {
    await sendReply(token, chatId, `Multiple coaches match "${intent.coach}" (${coaches.slice(0, 4).map((c) => c.full_name).join(", ")}). Be more specific.`);
    return;
  }
  const member = members[0];
  const coach = coaches[0];
  const iso = new Date(`${intent.target_date}T${intent.time_hint}:00+08:00`).toISOString();
  if (new Date(iso).getTime() < Date.now()) {
    await sendReply(token, chatId, "That time is in the past. Give a future day/time.");
    return;
  }
  const unixSec = Math.floor(new Date(iso).getTime() / 1000);
  const cbData = `ptc|${unixSec}|${member.full_name}|${coach.full_name}`;
  if (Buffer.byteLength(cbData, "utf8") > 64) {
    await sendReply(token, chatId, "Those names are too long for me to confirm safely — please book this one in the app.");
    return;
  }
  await sendReplyWithKeyboard(
    token,
    chatId,
    `Book this PT session?\n\n${member.full_name} with Coach ${coach.full_name}\n${fmtSgt(iso)}  (60 min)`,
    [[{ text: "✅ Yes, book it", callback_data: cbData }, { text: "❌ No", callback_data: "ptx:n" }]]
  );
}

async function requestReschedule(token: string, chatId: number, supabase: SupabaseSR, intent: Intent) {
  const matches = await findScheduledSessions(supabase, {
    client_name: intent.person,
    target_date: intent.target_date,
    time_hint: intent.time_hint,
  });
  if (!intent.person) {
    await sendReply(token, chatId, "Whose PT session? Try: move John's PT to Fri 6pm");
    return;
  }
  if (!matches.length) {
    await sendReply(token, chatId, `No scheduled PT session found for "${intent.person}".`);
    return;
  }
  if (matches.length > 1) {
    await sendReply(
      token,
      chatId,
      `Found ${matches.length} sessions for "${intent.person}". Be more specific, e.g. include the current day/time: move ${intent.person}'s PT from Thu 6pm to Fri 6pm.`
    );
    return;
  }
  const s = matches[0];
  if (!intent.new_time) {
    await sendReply(token, chatId, `Move ${nameOf(s.member)}'s session (${fmtSgt(s.scheduled_at)}) to when? e.g. "Fri 7pm".`);
    return;
  }
  // New date defaults to the session's current SGT date if only a time was given.
  const currentYmd = new Date(s.scheduled_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Singapore" });
  const newYmd = intent.new_date || currentYmd;
  const newIso = new Date(`${newYmd}T${intent.new_time}:00+08:00`).toISOString();
  if (new Date(newIso).getTime() < Date.now()) {
    await sendReply(token, chatId, "That new time is in the past. Give a future time.");
    return;
  }
  const unixSec = Math.floor(new Date(newIso).getTime() / 1000);
  await sendReplyWithKeyboard(
    token,
    chatId,
    `Reschedule this PT session?\n\n${nameOf(s.member)}\nFrom: ${fmtSgt(s.scheduled_at)}\nTo:   ${fmtSgt(newIso)}`,
    [[{ text: "✅ Yes, move it", callback_data: `ptr:${s.id}:${unixSec}` }, { text: "❌ No", callback_data: "ptx:n" }]]
  );
}

async function requestMark(token: string, chatId: number, supabase: SupabaseSR, intent: Intent) {
  const mark = intent.mark;
  if (!mark) {
    await sendReply(token, chatId, "Mark it completed or no-show? Try: mark John's PT today as no-show");
    return;
  }
  if (!intent.person) {
    await sendReply(token, chatId, "Whose PT session? Try: mark John's PT today completed");
    return;
  }
  const matches = await findScheduledSessions(supabase, {
    client_name: intent.person,
    target_date: intent.target_date,
    time_hint: intent.time_hint,
  });
  if (!matches.length) {
    await sendReply(token, chatId, `No scheduled PT session found for "${intent.person}".`);
    return;
  }
  const verb = mark === "completed" ? "completed ✅" : "no-show ⚠️";
  const code = mark === "completed" ? "c" : "n";
  if (matches.length === 1) {
    const s = matches[0];
    await sendReplyWithKeyboard(
      token,
      chatId,
      `Mark this PT session as ${verb}?\n\n${nameOf(s.member)} — ${fmtSgt(s.scheduled_at)}`,
      [[{ text: `✅ Yes, ${mark === "completed" ? "completed" : "no-show"}`, callback_data: `ptm:${code}:${s.id}` }, { text: "❌ No", callback_data: "ptx:n" }]]
    );
    return;
  }
  const rows: InlineButton[][] = matches.slice(0, 6).map((s) => [
    { text: `${nameOf(s.member)} — ${fmtSgt(s.scheduled_at)}`, callback_data: `ptm:${code}:${s.id}` },
  ]);
  rows.push([{ text: "❌ None", callback_data: "ptx:n" }]);
  await sendReplyWithKeyboard(token, chatId, `Which session to mark ${verb}?`, rows);
}

async function requestLeaveReview(token: string, chatId: number, supabase: SupabaseSR, intent: Intent) {
  if (!intent.decision) {
    await sendReply(token, chatId, "Approve or reject? Try: approve Ali's leave");
    return;
  }
  if (!intent.person) {
    await sendReply(token, chatId, "Whose leave? Try: approve Ali's leave");
    return;
  }
  const name = intent.person.toLowerCase().trim();
  const { data: pending } = await supabase
    .from("leaves")
    .select("id, leave_date, leave_end_date, leave_type, is_half_day, coach:users!leaves_coach_id_fkey(full_name)")
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("leave_date");
  const matches = (pending || []).filter((l: { coach: unknown }) => nameOf(l.coach).toLowerCase().includes(name));
  if (!matches.length) {
    await sendReply(token, chatId, `No pending leave found for "${intent.person}".`);
    return;
  }
  const code = intent.decision === "approve" ? "a" : "r";
  const verb = intent.decision === "approve" ? "APPROVE ✅" : "REJECT ❌";
  if (matches.length === 1) {
    const l = matches[0];
    const span = `${dateLabel(l.leave_date)}${l.leave_end_date !== l.leave_date ? "–" + dateLabel(l.leave_end_date) : ""}`;
    await sendReplyWithKeyboard(
      token,
      chatId,
      `${verb} this leave?\n\n${nameOf(l.coach)} — ${span} (${l.leave_type}${l.is_half_day ? ", half day" : ""})`,
      [[{ text: `${intent.decision === "approve" ? "✅ Approve" : "❌ Reject"}`, callback_data: `lv:${code}:${l.id}` }, { text: "✖ Never mind", callback_data: "ptx:n" }]]
    );
    return;
  }
  const rows: InlineButton[][] = matches.slice(0, 6).map((l: { id: string; leave_date: string; leave_end_date: string; coach: unknown }) => [
    {
      text: `${nameOf(l.coach)} — ${dateLabel(l.leave_date)}${l.leave_end_date !== l.leave_date ? "–" + dateLabel(l.leave_end_date) : ""}`,
      callback_data: `lv:${code}:${l.id}`,
    },
  ]);
  rows.push([{ text: "✖ Never mind", callback_data: "ptx:n" }]);
  await sendReplyWithKeyboard(token, chatId, `${verb} which leave?`, rows);
}

async function requestClassCancel(token: string, chatId: number, supabase: SupabaseSR, intent: Intent) {
  const ymd = intent.target_date || sgtToday();
  const dow = sgtDow(ymd);
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, start_time")
    .or(`day_of_week.eq.${dow},event_date.eq.${ymd}`)
    .eq("is_active", true)
    .order("start_time");
  let matches = classes || [];
  if (intent.class_name) {
    const n = intent.class_name.toLowerCase();
    matches = matches.filter((c: { name: string }) => c.name.toLowerCase().includes(n));
  }
  if (!matches.length) {
    await sendReply(token, chatId, `No class found${intent.class_name ? ` matching "${intent.class_name}"` : ""} on ${dateLabel(ymd)}.`);
    return;
  }
  if (matches.length === 1) {
    const c = matches[0];
    await sendReplyWithKeyboard(
      token,
      chatId,
      `Cancel this class occurrence?\n\n${c.name} — ${hhmm(c.start_time)}, ${dateLabel(ymd)}\n\n⚠️ This cancels the class for ${dateLabel(ymd)} only and notifies the assigned coaches. (Members are not auto-notified — JMT has no per-class member list.)`,
      [[{ text: "✅ Yes, cancel", callback_data: `cc:${c.id}:${ymd}` }, { text: "❌ No", callback_data: "ptx:n" }]]
    );
    return;
  }
  const rows: InlineButton[][] = matches.slice(0, 6).map((c: { id: string; name: string; start_time: string }) => [
    { text: `${c.name} — ${hhmm(c.start_time)}`, callback_data: `cc:${c.id}:${ymd}` },
  ]);
  rows.push([{ text: "❌ None", callback_data: "ptx:n" }]);
  await sendReplyWithKeyboard(token, chatId, `Which class on ${dateLabel(ymd)}?`, rows);
}

const HELP_TEXT = `I can help with JMT, just tell me:
• "today's schedule" / "tomorrow's classes"
• "today's PT" · "how many sessions has John left"
• "any leaves" · "leads today" · "trials today" · "morning brief"
• "schedule PT with John for coach Ali tmrw 10am"
• "cancel John's PT Thu 6pm"
• "move John's PT to Fri 7pm"
• "mark John's PT today no-show"
• "approve Ali's leave" / "reject Ali's leave"
• "cancel the 7pm class today"
I'll always ask you to confirm before changing anything.`;

// Route an admin's free-text message to the right capability.
async function handleAssistantText(token: string, chatId: number, text: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  const sender = await getSender(supabase, chatId, ["admin", "master_admin"]);
  if (!sender) {
    // Not an admin — stay silent (unknown members shouldn't get command hints).
    return;
  }

  let intent: Intent;
  try {
    intent = await classifyIntent(text);
  } catch (err) {
    console.error("[telegram-webhook] classify error:", err);
    await sendReply(token, chatId, "Sorry, I couldn't understand that. Type \"help\" to see what I can do.");
    return;
  }

  // Guard: GPT can return a non-date like "thursday" instead of null. A bad
  // value would make `new Date(...).toISOString()` throw (RangeError) deep in a
  // handler → uncaught 500 → Telegram retry loop. Coerce anything malformed to null.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(intent.target_date ?? "")) intent.target_date = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(intent.new_date ?? "")) intent.new_date = null;
  if (!/^\d{2}:\d{2}$/.test(intent.time_hint ?? "")) intent.time_hint = null;
  if (!/^\d{2}:\d{2}$/.test(intent.new_time ?? "")) intent.new_time = null;

  const ymd = intent.target_date || sgtToday();
  try {
    switch (intent.intent) {
      case "schedule_today":
        await replySchedule(token, chatId, supabase, ymd);
        break;
      case "pt_today":
        await replyPtToday(token, chatId, supabase, ymd);
        break;
      case "leaves":
        await replyLeaves(token, chatId, supabase);
        break;
      case "pt_package":
        await replyPtPackage(token, chatId, supabase, intent.person);
        break;
      case "leads":
        await replyLeads(token, chatId, supabase, intent.target_date);
        break;
      case "trials_today":
        await replyTrials(token, chatId, supabase, ymd);
        break;
      case "morning_brief":
        await replyMorningBrief(token, chatId, supabase);
        break;
      case "pt_cancel":
        await handleCancelRequest(token, chatId, text);
        break;
      case "pt_reschedule":
        await requestReschedule(token, chatId, supabase, intent);
        break;
      case "pt_mark":
        await requestMark(token, chatId, supabase, intent);
        break;
      case "leave_review":
        await requestLeaveReview(token, chatId, supabase, intent);
        break;
      case "class_cancel":
        await requestClassCancel(token, chatId, supabase, intent);
        break;
      case "pt_create":
        await requestPtCreate(token, chatId, supabase, intent);
        break;
      case "help":
        await sendReply(token, chatId, HELP_TEXT);
        break;
      default:
        await sendReply(token, chatId, "Not sure what you mean. Type \"help\" to see what I can do.");
    }
  } catch (err) {
    console.error("[telegram-webhook] handler error:", err);
    await sendReply(token, chatId, "Sorry, something went wrong handling that — please try rephrasing.");
  }
}

// ── ACTION callbacks (apply the confirmed change) ──

async function cbPtCreate(token: string, cbId: string, chatId: number, messageId: number, sender: { full_name: string }, supabase: SupabaseSR, unixSec: number, memberName: string, coachName: string) {
  if (!Number.isFinite(unixSec) || unixSec <= 0 || unixSec > 4102444800) {
    await answerCallback(token, cbId, "Bad time.");
    return;
  }
  const pick = (list: { id: string; full_name: string }[], name: string) => {
    const exact = list.find((u) => (u.full_name || "").toLowerCase() === name.toLowerCase());
    return exact || list[0] || null;
  };
  const member = pick(await resolveByName(supabase, memberName, ["member"]), memberName);
  const coach = pick(await resolveByName(supabase, coachName, ["coach", "admin", "master_admin"]), coachName);
  if (!member || !coach) {
    await answerCallback(token, cbId, "Couldn't match names.");
    await editMessageText(token, chatId, messageId, "Couldn't find that member or coach anymore — please book it in the app.");
    return;
  }
  const iso = new Date(unixSec * 1000).toISOString();

  // Attach an active package if the member has one with this coach (mirrors createPtSession).
  const { data: pkg } = await supabase
    .from("pt_packages")
    .select("id")
    .eq("user_id", member.id)
    .eq("preferred_coach_id", coach.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("pt_sessions")
    .insert({
      package_id: pkg?.id || null,
      coach_id: coach.id,
      member_id: member.id,
      scheduled_at: iso,
      duration_minutes: 60,
      status: "scheduled",
    })
    .select("id")
    .maybeSingle();
  if (error || !created) {
    await answerCallback(token, cbId, "Couldn't book it.");
    await editMessageText(token, chatId, messageId, `Couldn't book the session — ${error?.message || "try again"}.`);
    return;
  }
  try {
    await createNotification(
      coach.id,
      "pt_created",
      "PT Session Scheduled",
      `${sender.full_name} booked a PT session with ${member.full_name} on ${fmtSgt(iso)}.`
    );
  } catch (err) {
    console.error("[telegram-webhook] pt-create notify failed:", err);
  }
  await answerCallback(token, cbId, "Booked ✅");
  await editMessageText(token, chatId, messageId, `✅ Booked — ${member.full_name} with Coach ${coach.full_name}, ${fmtSgt(iso)}. Coach notified.`);
}

async function cbReschedule(token: string, cbId: string, chatId: number, messageId: number, sender: { id: string; full_name: string }, supabase: SupabaseSR, sessionId: string, unixSec: number) {
  // Guard a spoofed/oversized epoch from producing an Invalid Date.
  if (!Number.isFinite(unixSec) || unixSec <= 0 || unixSec > 4102444800) {
    await answerCallback(token, cbId, "Bad time.");
    return;
  }
  const newIso = new Date(unixSec * 1000).toISOString();
  const { data: session } = await supabase
    .from("pt_sessions")
    .select("id, status, coach_id, scheduled_at, member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "scheduled") {
    await answerCallback(token, cbId, "No longer available.");
    await editMessageText(token, chatId, messageId, "That session is no longer scheduled — no change made.");
    return;
  }
  const { data: updated, error } = await supabase
    .from("pt_sessions")
    .update({ scheduled_at: newIso, edited_by: sender.id, edited_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    await answerCallback(token, cbId, "Couldn't move it.");
    await editMessageText(token, chatId, messageId, "Couldn't reschedule — it may have just changed. Try again.");
    return;
  }
  const memberName = nameOf(session.member);
  if (session.coach_id) {
    try {
      await createNotification(
        session.coach_id as string,
        "pt_created",
        "PT Session Updated",
        `${sender.full_name} moved your PT session with ${memberName} to ${fmtSgt(newIso)}.`
      );
    } catch (err) {
      console.error("[telegram-webhook] reschedule notify failed:", err);
    }
  }
  await answerCallback(token, cbId, "Moved ✅");
  await editMessageText(token, chatId, messageId, `✅ Moved — ${memberName} is now ${fmtSgt(newIso)}. Coach notified.`);
}

async function cbMark(token: string, cbId: string, chatId: number, messageId: number, sender: { full_name: string }, supabase: SupabaseSR, code: string, sessionId: string) {
  const newStatus = code === "c" ? "completed" : "no_show";
  const { data: session } = await supabase
    .from("pt_sessions")
    .select("id, status, coach_id, package_id, scheduled_at, member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "scheduled") {
    await answerCallback(token, cbId, "Already resolved.");
    await editMessageText(token, chatId, messageId, "That session is no longer scheduled — no change made.");
    return;
  }
  const { data: updated, error } = await supabase
    .from("pt_sessions")
    .update({ status: newStatus })
    .eq("id", sessionId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    await answerCallback(token, cbId, "Couldn't update.");
    await editMessageText(token, chatId, messageId, "Couldn't update — try again.");
    return;
  }
  // On completion, consume one package session (mirrors updateSessionStatus).
  if (newStatus === "completed" && session.package_id) {
    const { data: pkg } = await supabase
      .from("pt_packages")
      .select("sessions_used, total_sessions")
      .eq("id", session.package_id as string)
      .maybeSingle();
    if (pkg) {
      const newUsed = pkg.sessions_used + 1;
      await supabase
        .from("pt_packages")
        .update({ sessions_used: newUsed, status: newUsed >= pkg.total_sessions ? "completed" : "active" })
        .eq("id", session.package_id as string);
    }
  }
  const memberName = nameOf(session.member);
  const when = fmtSgt(session.scheduled_at as string);
  if (session.coach_id) {
    try {
      await createNotification(
        session.coach_id as string,
        "pt_created",
        newStatus === "completed" ? "PT Session Completed" : "PT Session No-Show",
        `${sender.full_name} marked your PT session with ${memberName} on ${when} as ${newStatus === "completed" ? "completed" : "no-show"}.`
      );
    } catch (err) {
      console.error("[telegram-webhook] mark notify failed:", err);
    }
  }
  await answerCallback(token, cbId, "Done ✅");
  await editMessageText(token, chatId, messageId, `✅ ${memberName} — ${when}: marked ${newStatus === "completed" ? "completed" : "no-show"}.`);
}

async function cbLeave(token: string, cbId: string, chatId: number, messageId: number, sender: { id: string; full_name: string }, supabase: SupabaseSR, code: string, leaveId: string) {
  const action = code === "a" ? "approved" : "rejected";
  const { data: leave } = await supabase
    .from("leaves")
    .select("id, status, coach_id, leave_date, leave_end_date, coach:users!leaves_coach_id_fkey(full_name)")
    .eq("id", leaveId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!leave || leave.status !== "pending") {
    await answerCallback(token, cbId, "Already handled.");
    await editMessageText(token, chatId, messageId, `That leave is no longer pending${leave ? ` (${leave.status})` : ""} — no change made.`);
    return;
  }
  const { data: updated, error } = await supabase
    .from("leaves")
    .update({ status: action, reviewed_by: sender.id, reviewed_at: new Date().toISOString() })
    .eq("id", leaveId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    await answerCallback(token, cbId, "Couldn't update.");
    await editMessageText(token, chatId, messageId, "Couldn't update the leave — try again.");
    return;
  }
  const coachName = nameOf(leave.coach);
  const span = `${dateLabel(leave.leave_date as string)}${leave.leave_end_date !== leave.leave_date ? "–" + dateLabel(leave.leave_end_date as string) : ""}`;
  if (leave.coach_id) {
    try {
      await createNotification(
        leave.coach_id as string,
        "system",
        action === "approved" ? "Leave Approved ✅" : "Leave Rejected ❌",
        `Your leave (${span}) was ${action} by ${sender.full_name}.`
      );
    } catch (err) {
      console.error("[telegram-webhook] leave notify failed:", err);
    }
  }
  await answerCallback(token, cbId, action === "approved" ? "Approved ✅" : "Rejected ❌");
  await editMessageText(token, chatId, messageId, `${action === "approved" ? "✅ Approved" : "❌ Rejected"} — ${coachName}'s leave (${span}). Coach notified.`);
}

async function cbClassCancel(token: string, cbId: string, chatId: number, messageId: number, sender: { full_name: string }, supabase: SupabaseSR, classId: string, ymd: string) {
  const { data: cls } = await supabase
    .from("classes")
    .select("id, name, start_time, lead_coach_id, assistant_coach_id, class_coaches(coach_id)")
    .eq("id", classId)
    .maybeSingle();
  if (!cls) {
    await answerCallback(token, cbId, "Class not found.");
    await editMessageText(token, chatId, messageId, "That class no longer exists.");
    return;
  }
  // Already cancelled for this date?
  const { data: existing } = await supabase
    .from("class_sessions")
    .select("id, status")
    .eq("class_id", classId)
    .eq("session_date", ymd)
    .maybeSingle();
  if (existing && existing.status === "cancelled") {
    await answerCallback(token, cbId, "Already cancelled.");
    await editMessageText(token, chatId, messageId, `${cls.name} on ${dateLabel(ymd)} was already cancelled.`);
    return;
  }
  if (existing) {
    await supabase.from("class_sessions").update({ status: "cancelled" }).eq("id", existing.id);
  } else {
    const { error } = await supabase.from("class_sessions").insert({ class_id: classId, session_date: ymd, status: "cancelled" });
    if (error) {
      // 23505 = unique violation: a concurrent tap/retry already cancelled it.
      // Treat as done so we don't double-notify the coaches. (Requires the
      // unique index in supabase/migrations/*_class_sessions_unique.sql.)
      if (error.code === "23505") {
        await answerCallback(token, cbId, "Already cancelled.");
        await editMessageText(token, chatId, messageId, `${cls.name} on ${dateLabel(ymd)} was already cancelled.`);
        return;
      }
      await answerCallback(token, cbId, "Couldn't cancel.");
      await editMessageText(token, chatId, messageId, `Couldn't cancel the class — ${error.message}`);
      return;
    }
  }
  // Notify assigned coaches (no member roster exists in JMT).
  const coachIds = new Set<string>();
  if (cls.lead_coach_id) coachIds.add(cls.lead_coach_id as string);
  if (cls.assistant_coach_id) coachIds.add(cls.assistant_coach_id as string);
  const extra = (cls.class_coaches as unknown as { coach_id: string }[]) || [];
  extra.forEach((r) => r.coach_id && coachIds.add(r.coach_id));
  for (const cid of Array.from(coachIds)) {
    try {
      await createNotification(
        cid,
        "system",
        "Class Cancelled",
        `${sender.full_name} cancelled ${cls.name} (${hhmm(cls.start_time as string)}) on ${dateLabel(ymd)}.`
      );
    } catch (err) {
      console.error("[telegram-webhook] class-cancel notify failed:", err);
    }
  }
  await answerCallback(token, cbId, "Cancelled ✅");
  await editMessageText(token, chatId, messageId, `✅ Cancelled — ${cls.name}, ${dateLabel(ymd)}. ${coachIds.size} coach(es) notified. (Members not auto-notified.)`);
}

// Top-level callback dispatcher. All confirm buttons route through here.
async function handleCallback(token: string, cb: NonNullable<TelegramUpdate["callback_query"]>) {
  const data = cb.data || "";
  // "no / never mind" and legacy cancel buttons keep the existing handler.
  if (data === "ptx:n" || data.startsWith("ptx:y:")) {
    return handleCancelCallback(token, cb);
  }

  const cbId = cb.id;
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId) {
    await answerCallback(token, cbId);
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    await answerCallback(token, cbId);
    return;
  }
  const sender = await getSender(supabase, chatId, ["admin", "master_admin"]);
  if (!sender) {
    await answerCallback(token, cbId, "Not authorised.");
    return;
  }

  try {
    let m: RegExpMatchArray | null;
    if ((m = data.match(/^ptc\|(\d+)\|(.+?)\|(.+)$/))) {
      await cbPtCreate(token, cbId, chatId, messageId, sender, supabase, parseInt(m[1], 10), m[2], m[3]);
    } else if ((m = data.match(/^ptr:(.+):(\d+)$/))) {
      await cbReschedule(token, cbId, chatId, messageId, sender, supabase, m[1], parseInt(m[2], 10));
    } else if ((m = data.match(/^ptm:([cn]):(.+)$/))) {
      await cbMark(token, cbId, chatId, messageId, sender, supabase, m[1], m[2]);
    } else if ((m = data.match(/^lv:([ar]):(.+)$/))) {
      await cbLeave(token, cbId, chatId, messageId, sender, supabase, m[1], m[2]);
    } else if ((m = data.match(/^cc:(.+):(\d{4}-\d{2}-\d{2})$/))) {
      await cbClassCancel(token, cbId, chatId, messageId, sender, supabase, m[1], m[2]);
    } else {
      await answerCallback(token, cbId);
    }
  } catch (err) {
    console.error("[telegram-webhook] callback error:", err);
    await answerCallback(token, cbId, "Something went wrong.");
  }
}

export async function POST(req: NextRequest) {
  // Fail-closed secret-token check (mirrors verifyMetaSignature): if
  // TELEGRAM_WEBHOOK_SECRET is unset, or Telegram's header doesn't match, reject.
  // Telegram sends this header when the webhook is registered with a secret_token.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }

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

  // Inline-button taps (confirm dialogs) arrive as callback_query.
  if (update.callback_query) {
    await handleCallback(token, update.callback_query);
    return NextResponse.json({ ok: true, action: "callback" });
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

  // Everything else → the natural-language JMT assistant (admin-gated inside).
  if (text) {
    await handleAssistantText(token, chatId, text);
    return NextResponse.json({ ok: true, action: "assistant" });
  }

  // Unknown message — ignore
  return NextResponse.json({ ok: true, skipped: "unhandled" });
}
