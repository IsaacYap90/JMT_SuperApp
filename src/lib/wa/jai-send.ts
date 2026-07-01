// WhatsApp Cloud API send + inbound-payload helpers — ported from jai-bot.

const WA_API_BASE = () =>
  `https://graph.facebook.com/v21.0/${process.env.WA_PHONE_NUMBER_ID}`;

async function waFetch(endpoint: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${WA_API_BASE()}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[jai-send] WA API error ${res.status}:`, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[jai-send] fetch error", err);
    return false;
  }
}

export async function sendText(to: string, text: string) {
  return waFetch("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

// Interactive quick-reply buttons (WhatsApp allows max 3, 20-char titles).
export async function sendQuickReplies(to: string, bodyText: string, buttons: string[]) {
  const trimmed = buttons.slice(0, 3).map((btn, i) => ({
    type: "reply",
    reply: { id: `btn_${i}`, title: btn.slice(0, 20) },
  }));
  return waFetch("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: { type: "button", body: { text: bodyText }, action: { buttons: trimmed } },
  });
}

export async function markRead(messageId: string) {
  return waFetch("/messages", {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

// ── Inbound payload parsing ──────────────────────────────────────────────────

export type InboundMessage = {
  messageId: string;
  from: string;
  contactName: string | null;
  type: string;
  text: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractMessage(body: any): InboundMessage | null {
  try {
    const change = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = change?.messages?.[0];
    if (!msg) return null;
    const contact = change?.contacts?.[0];

    const result: InboundMessage = {
      messageId: msg.id,
      from: msg.from,
      contactName: contact?.profile?.name || null,
      type: msg.type,
      text: null,
    };

    if (msg.type === "text") {
      result.text = msg.text.body;
    } else if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
      result.text = msg.interactive.button_reply.title;
    } else if (msg.type === "button") {
      result.text = msg.button.text;
    }
    return result;
  } catch (err) {
    console.error("[jai-send] extractMessage error", err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isStatusUpdate(body: any): boolean {
  const change = body?.entry?.[0]?.changes?.[0]?.value;
  return !!(change?.statuses && !change?.messages);
}
