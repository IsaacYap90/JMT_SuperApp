// Instagram Direct — inbound webhook payload parsing + outbound send.
//
// Setup verified against Meta's docs (2026-09-02, "Send a Message", Messenger
// Platform): our Instagram Professional account IS linked to a Facebook Page
// (that is how src/lib/meta/dms.ts already reads IG conversations, via
// /<PAGE_ID>/conversations?platform=instagram). For that setup you send with the
// SAME /<PAGE_ID>/messages endpoint as Messenger, using the Instagram-scoped ID
// (IGSID) as the recipient, with the Page access token — which is exactly what
// postDmReply() in ./dms.ts already does. So the send path is REUSED, not forked.
//
// The other setup — an IG account NOT linked to a Page — uses
// graph.instagram.com/<IG_ID>/messages with an Instagram user token. We do not
// use it. If the Page link is ever removed, this stops working and the errors
// below will show it.

/** Inbound Instagram messaging event, narrowed to what we act on. */
export type IgInbound = {
  /** Instagram-scoped ID of the person who messaged us. */
  senderId: string;
  /** The IG account / page id the message was sent TO. */
  recipientId: string;
  /** Message id (`mid`) — stable across Meta's retries, used for dedupe. */
  messageId: string;
  /** Plain text of the message (or a quick-reply title). Null for media-only. */
  text: string | null;
  /** Epoch ms from the webhook. */
  timestamp: number | null;
};

/**
 * Pull actionable inbound messages out of an Instagram webhook body.
 *
 * Shape (Meta docs, `instagram` topic → `messages` field):
 *   { object: "instagram", entry: [ { id, time, messaging: [ {
 *       sender: { id }, recipient: { id }, timestamp,
 *       message: { mid, text?, is_echo?, is_deleted?, attachments?, quick_reply? }
 *   } ] } ] }
 *
 * Deliberately IGNORED (returns nothing for them):
 *  • `is_echo` — our OWN outbound message replayed back to us. Acting on these
 *    is an infinite self-reply loop, which is the single worst first-contact
 *    failure available here.
 *  • `is_deleted` / `is_unsupported` — nothing to answer.
 *  • read / delivery / reaction / postback / referral events — no `message.mid`.
 *  • messages where the sender IS the recipient (self-send).
 *  • media-only messages (no text) — the caller decides what to do; we return
 *    them with text: null so the caller can log + alert rather than reply.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractInstagramMessages(body: any): IgInbound[] {
  const out: IgInbound[] = [];
  if (!body || body.object !== "instagram") return out;
  for (const entry of body.entry || []) {
    for (const ev of entry?.messaging || []) {
      const msg = ev?.message;
      if (!msg || !msg.mid) continue;
      if (msg.is_echo || msg.is_deleted || msg.is_unsupported) continue;
      const senderId = ev?.sender?.id;
      const recipientId = ev?.recipient?.id;
      if (!senderId || !recipientId || senderId === recipientId) continue;
      const text: string | null =
        typeof msg.text === "string" && msg.text.trim()
          ? msg.text.trim()
          : typeof msg.quick_reply?.payload === "string" && msg.quick_reply.payload.trim()
            ? msg.quick_reply.payload.trim()
            : null;
      out.push({
        senderId: String(senderId),
        recipientId: String(recipientId),
        messageId: String(msg.mid),
        text,
        timestamp: typeof ev.timestamp === "number" ? ev.timestamp : null,
      });
    }
  }
  return out;
}

/** Our own IG / Page ids — a message "from" one of these is never a customer. */
export function isOurOwnId(id: string): boolean {
  const ig = (process.env.META_IG_ID || "").trim();
  const page = (process.env.META_PAGE_ID || "").trim();
  return (!!ig && id === ig) || (!!page && id === page);
}

/**
 * How the Instagram Send API can fail, in the words of Meta's error-code table
 * (docs "Send a Message" → Error handling, read 2026-09-02). Used to turn a
 * silent send failure into an actionable Telegram line for Jeremy, because the
 * two most likely first-contact failures — a missing permission and the closed
 * 24-hour window — are indistinguishable from "it worked" in a log that only
 * says `false`.
 */
export function describeSendError(code?: number, message?: string): string {
  switch (code) {
    case 10:
      return "Permissions error — the app is missing instagram_manage_messages / pages_messaging, or the Page token can't message. (Meta code 10)";
    case 100:
      return "Invalid parameter — wrong recipient id (must be the IGSID from the webhook) or bad message body. (Meta code 100)";
    case 190:
      return "Page access token expired or invalid — regenerate META_PAGE_TOKEN. (Meta code 190)";
    case 551:
      return "Person is not available — they may have blocked us, deleted the thread, or deactivated. (Meta code 551)";
    case 613:
      return "Rate limit exceeded — too many sends. (Meta code 613)";
    default:
      return message || `Instagram send failed${code ? ` (Meta code ${code})` : ""}`;
  }
}

/**
 * THE 24-HOUR WINDOW — read this before "fixing" a send that fails at 2am.
 *
 * A customer's inbound message opens a 24-hour Standard Messaging Window; a
 * `messaging_type: "RESPONSE"` reply is only allowed inside it. This webhook
 * ALWAYS replies to a message that just arrived, so the window is open by
 * construction and no message tag is needed. A tag (HUMAN_AGENT, 7 days) would
 * only be needed for a delayed/proactive send — we do not do one, and adding
 * one requires the Human Agent feature to be approved for the app.
 *
 * NOT VERIFIED BY ME: what Meta returns when a reply lands microseconds after
 * the window shuts (e.g. Meta retries a 36-hour-old event). If that happens the
 * send fails and describeSendError() surfaces it rather than pretending success.
 */
export const IG_WINDOW_NOTE =
  "Reply must go out inside the 24h window opened by the customer's message.";
