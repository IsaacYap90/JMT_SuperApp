// Telegram alert helper — routes JMT in-app notifications to Telegram DMs
// on a per-user basis. Only the users explicitly listed in the env map get
// pinged; everyone else receives their notifications in-app only.
//
// Env vars:
//   JMT_TELEGRAM_BOT_TOKEN   — bot token from @BotFather (@Jmt_alert_bot)
//   JMT_TELEGRAM_USER_MAP    — comma-separated pairs of <jmt_user_id>:<telegram_chat_id>
//                              e.g. "94737c7f-...:1729085064,d8918b90-...:1729085064"
//
// Silently no-ops if env vars are missing so the dashboard keeps working
// in environments where the bot isn't configured.

function escapeMarkdown(text: string): string {
  // Telegram MarkdownV2 reserved chars
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function getEnvUserMap(): Map<string, string> {
  const raw = process.env.JMT_TELEGRAM_USER_MAP || "";
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const [userId, chatId] = trimmed.split(":").map((s) => s.trim());
    if (userId && chatId) map.set(userId, chatId);
  }
  return map;
}

async function getChatId(userId: string): Promise<string | null> {
  // DB first (set by /start deep-link webhook), then env var fallback
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key);
    const { data } = await sb
      .from("users")
      .select("id, telegram_chat_id")
      .eq("id", userId)
      .maybeSingle();
    if (data?.telegram_chat_id) return data.telegram_chat_id;
  }
  return getEnvUserMap().get(userId) || null;
}

async function logTelegramSend(opts: {
  recipientUserId: string | null;
  chatId: string | null;
  source: string;
  ok: boolean;
  httpStatus?: number | null;
  error?: string | null;
  text?: string | null;
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key);
    await sb.from("telegram_logs").insert({
      recipient_user_id: opts.recipientUserId,
      chat_id: opts.chatId,
      source: opts.source,
      ok: opts.ok,
      http_status: opts.httpStatus ?? null,
      error: opts.error ?? null,
      payload_preview: opts.text ? opts.text.slice(0, 500) : null,
    });
  } catch (err) {
    console.error("[telegram-logs] insert failed:", err);
  }
}

// Plain-text DM helper. Skips Telegram's MarkdownV2 parser entirely so callers
// don't have to worry about escaping reserved characters in dynamic content
// like class names, member names, or punctuation. Returns true on HTTP 200.
export async function sendTelegramPlainToUser(
  recipientUserId: string,
  text: string,
  source: string = "plain"
): Promise<boolean> {
  const token = process.env.JMT_TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const chatId = await getChatId(recipientUserId);
  if (!chatId) {
    await logTelegramSend({ recipientUserId, chatId: null, source, ok: false, error: "no_chat_id", text });
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[telegram-alert plain] ${chatId} failed: ${res.status} ${body}`);
      await logTelegramSend({ recipientUserId, chatId, source, ok: false, httpStatus: res.status, error: body.slice(0, 500), text });
      return false;
    }
    await logTelegramSend({ recipientUserId, chatId, source, ok: true, httpStatus: res.status, text });
    return true;
  } catch (err) {
    console.error(`[telegram-alert plain] ${chatId} exception:`, err);
    await logTelegramSend({ recipientUserId, chatId, source, ok: false, error: String(err).slice(0, 500), text });
    return false;
  }
}

// Fire a Telegram DM to a specific JMT user, if they're mapped in the env.
// Returns silently if the user isn't mapped or the bot isn't configured.
export async function sendTelegramAlertToUser(
  recipientUserId: string,
  title: string,
  message: string,
  source: string = "alert"
): Promise<void> {
  const token = process.env.JMT_TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const chatId = await getChatId(recipientUserId);
  if (!chatId) return; // user not opted in — in-app notification only

  const text = `*${escapeMarkdown(title)}*\n${escapeMarkdown(message)}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[telegram-alert] ${chatId} failed: ${res.status} ${body}`);
      await logTelegramSend({ recipientUserId, chatId, source, ok: false, httpStatus: res.status, error: body.slice(0, 500), text });
    } else {
      await logTelegramSend({ recipientUserId, chatId, source, ok: true, httpStatus: res.status, text });
    }
  } catch (err) {
    console.error(`[telegram-alert] ${chatId} exception:`, err);
    await logTelegramSend({ recipientUserId, chatId, source, ok: false, error: String(err).slice(0, 500), text });
  }
}
