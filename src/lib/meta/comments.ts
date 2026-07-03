// Meta (Facebook Page + Instagram) comment helpers for the JAI Meta assistant.
// Uses the never-expiring Page access token (META_PAGE_TOKEN) over plain fetch.
// Reads recent comments on the gym's own posts, and posts approved replies.

const GRAPH = "https://graph.facebook.com/v21.0";

const PAGE_TOKEN = () => process.env.META_PAGE_TOKEN || "";
const PAGE_ID = () => process.env.META_PAGE_ID || "";
const IG_ID = () => process.env.META_IG_ID || "";

// How far back / wide to look — keep it bounded so we only surface recent,
// relevant comments (unanswered leads) rather than years of history.
const POST_LIMIT = 15;
const COMMENT_LIMIT = 50;
const MAX_AGE_DAYS = 45;

export type IngestedComment = {
  platform: "facebook" | "instagram";
  comment_id: string;
  post_id: string | null;
  post_caption: string | null;
  permalink: string | null;
  author_name: string | null;
  author_username: string | null;
  comment_text: string | null;
  comment_created_at: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, access_token: PAGE_TOKEN() });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `Graph GET ${path} failed (${res.status})`);
  }
  return data;
}

function isRecent(iso: string | null | undefined): boolean {
  if (!iso) return true; // keep if unknown
  const ageMs = Date.now() - new Date(iso).getTime();
  return ageMs <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function snippet(text: string | null | undefined, n = 140): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// ── Facebook Page comments ───────────────────────────────────────────────────
export async function fetchFacebookComments(): Promise<IngestedComment[]> {
  if (!PAGE_TOKEN() || !PAGE_ID()) return [];
  const data = await graphGet(`${PAGE_ID()}/feed`, {
    fields: `id,message,created_time,comments.limit(${COMMENT_LIMIT}){id,message,from,created_time,permalink_url}`,
    limit: String(POST_LIMIT),
  });
  const out: IngestedComment[] = [];
  for (const post of data?.data || []) {
    const caption = snippet(post.message);
    for (const c of post?.comments?.data || []) {
      // Skip the page's own replies.
      if (c?.from?.id && c.from.id === PAGE_ID()) continue;
      if (!isRecent(c.created_time)) continue;
      out.push({
        platform: "facebook",
        comment_id: c.id,
        post_id: post.id || null,
        post_caption: caption,
        permalink: c.permalink_url || null,
        author_name: c?.from?.name || null,
        author_username: null,
        comment_text: c.message || null,
        comment_created_at: c.created_time || null,
      });
    }
  }
  return out;
}

// ── Instagram comments ───────────────────────────────────────────────────────
export async function fetchInstagramComments(): Promise<IngestedComment[]> {
  if (!PAGE_TOKEN() || !IG_ID()) return [];
  const data = await graphGet(`${IG_ID()}/media`, {
    fields: `id,caption,permalink,comments.limit(${COMMENT_LIMIT}){id,text,username,timestamp,from}`,
    limit: String(POST_LIMIT),
  });
  const out: IngestedComment[] = [];
  for (const media of data?.data || []) {
    const caption = snippet(media.caption);
    for (const c of media?.comments?.data || []) {
      // Skip our own comments (matched by IG account id when available).
      if (c?.from?.id && c.from.id === IG_ID()) continue;
      if (!isRecent(c.timestamp)) continue;
      out.push({
        platform: "instagram",
        comment_id: c.id,
        post_id: media.id || null,
        post_caption: caption,
        permalink: media.permalink || null, // IG comments have no per-comment URL — link the post
        author_name: c.username ? `@${c.username}` : null,
        author_username: c.username || null,
        comment_text: c.text || null,
        comment_created_at: c.timestamp || null,
      });
    }
  }
  return out;
}

export async function fetchAllComments(): Promise<IngestedComment[]> {
  // Don't let one platform failing kill the other.
  const results = await Promise.allSettled([fetchFacebookComments(), fetchInstagramComments()]);
  const out: IngestedComment[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.error("[meta] fetch failed:", r.reason?.message || r.reason);
  }
  return out;
}

// ── Post an approved reply ───────────────────────────────────────────────────
// FB: POST /{comment-id}/comments  ·  IG: POST /{comment-id}/replies
export async function postReply(
  platform: "facebook" | "instagram",
  commentId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const edge = platform === "instagram" ? "replies" : "comments";
  const body = new URLSearchParams({ message, access_token: PAGE_TOKEN() });
  try {
    const res = await fetch(`${GRAPH}/${commentId}/${edge}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}
