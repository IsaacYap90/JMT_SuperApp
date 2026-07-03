// Meta DM helpers for the JAI Meta assistant — Facebook Messenger + Instagram
// Direct. Reads conversations where the customer sent the last message (awaiting
// a reply) and sends approved replies. Uses the Page access token.
//
// NOTE: FB Messenger works with the current token (pages_messaging). Instagram
// Direct additionally needs `instagram_manage_messages` on the token — until that
// scope is added, fetchInstagramDMs() returns [] and logs the gate.

const GRAPH = "https://graph.facebook.com/v21.0";
const PAGE_TOKEN = () => process.env.META_PAGE_TOKEN || "";
const PAGE_ID = () => process.env.META_PAGE_ID || "";

const CONVO_LIMIT = 25;
const MSG_LIMIT = 6;
const MAX_AGE_DAYS = 3; // only today + the last 3 days of DMs

export type IngestedDM = {
  platform: "facebook" | "instagram";
  conversation_id: string;
  participant_id: string | null;
  participant_name: string | null;
  last_user_message: string | null;
  last_message_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, access_token: PAGE_TOKEN() });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const err = new Error(data?.error?.message || `Graph GET ${path} failed (${res.status})`);
    // @ts-expect-error attach code for callers
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

// Pull conversations where the LATEST message is from the customer (not the page)
// — those are the ones awaiting a reply. platform: "messenger" | "instagram".
async function fetchConversations(platform: "messenger" | "instagram"): Promise<IngestedDM[]> {
  const data = await graphGet(`${PAGE_ID()}/conversations`, {
    platform,
    fields: `id,updated_time,participants,messages.limit(${MSG_LIMIT}){message,from,created_time}`,
    limit: String(CONVO_LIMIT),
  });
  const out: IngestedDM[] = [];
  for (const convo of data?.data || []) {
    const msgs = convo?.messages?.data || [];
    if (msgs.length === 0) continue;
    // Graph returns messages newest-first. If the page sent the latest, it's handled.
    const latest = msgs[0];
    if (!latest?.from?.id || latest.from.id === PAGE_ID()) continue;
    // Only surface recent threads — today + the last 3 days.
    const latestAt = latest.created_time || convo.updated_time || null;
    if (latestAt && Date.now() - new Date(latestAt).getTime() > MAX_AGE_DAYS * 864e5) continue;
    const participant = (convo?.participants?.data || []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => p.id !== PAGE_ID()
    );
    out.push({
      platform: platform === "instagram" ? "instagram" : "facebook",
      conversation_id: convo.id,
      participant_id: participant?.id || latest.from.id || null,
      participant_name: participant?.name || latest.from.name || null,
      last_user_message: latest.message || null,
      last_message_at: latest.created_time || convo.updated_time || null,
    });
  }
  return out;
}

export async function fetchFacebookDMs(): Promise<IngestedDM[]> {
  if (!PAGE_TOKEN() || !PAGE_ID()) return [];
  try {
    return await fetchConversations("messenger");
  } catch (err) {
    console.error("[meta-dm] FB fetch failed:", (err as Error).message);
    return [];
  }
}

export async function fetchInstagramDMs(): Promise<IngestedDM[]> {
  if (!PAGE_TOKEN() || !PAGE_ID()) return [];
  try {
    return await fetchConversations("instagram");
  } catch (err) {
    // #230 = missing instagram_manage_messages. Expected until the scope is added.
    console.error("[meta-dm] IG fetch failed:", (err as Error).message);
    return [];
  }
}

export async function fetchAllDMs(): Promise<IngestedDM[]> {
  const [fb, ig] = await Promise.all([fetchFacebookDMs(), fetchInstagramDMs()]);
  return [...fb, ...ig];
}

// Send an approved reply into a conversation. Both FB + IG use the Page's
// /messages edge with the recipient's PSID/IGSID. Subject to the 24h window.
export async function postDmReply(
  recipientId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const body = JSON.stringify({
    recipient: { id: recipientId },
    messaging_type: "RESPONSE",
    message: { text: message },
  });
  try {
    const res = await fetch(
      `${GRAPH}/${PAGE_ID()}/messages?access_token=${encodeURIComponent(PAGE_TOKEN())}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}
