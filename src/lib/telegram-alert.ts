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

function getUserMap(): Map<string, string> {
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

// Fire a Telegram DM to a specific JMT user, if they're mapped in the env.
// Returns silently if the user isn't mapped or the bot isn't configured.
export async function sendTelegramAlertToUser(
  recipientUserId: string,
  title: string,
  message: string
): Promise<void> {
  const token = process.env.JMT_TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const chatId = getUserMap().get(recipientUserId);
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
    }
  } catch (err) {
    console.error(`[telegram-alert] ${chatId} exception:`, err);
  }
}
