"use client";

// Per-device WA unread tracking (localStorage) — no schema changes.
// A thread is unread when it has an inbound ("user") message newer than the
// last time this device opened that thread. First visit sets a baseline so
// old history doesn't light everything up.

const READ_KEY = "wa-read-at"; // { [phone]: epoch ms of last read }
const BASELINE_KEY = "wa-read-baseline"; // epoch ms of first visit

export type UnreadConv = {
  phone: string;
  messages: { role: string; ts: string }[];
};

function readMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) || "{}");
  } catch {
    return {};
  }
}

function baseline(): number {
  const raw = localStorage.getItem(BASELINE_KEY);
  if (raw) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  const now = Date.now();
  localStorage.setItem(BASELINE_KEY, String(now));
  return now;
}

export function markThreadRead(phone: string, lastTs: string) {
  const t = new Date(lastTs).getTime();
  if (Number.isNaN(t)) return;
  const m = readMap();
  if (!m[phone] || m[phone] < t) {
    m[phone] = t;
    localStorage.setItem(READ_KEY, JSON.stringify(m));
  }
}

export function unreadPhones(convs: UnreadConv[]): Set<string> {
  const base = baseline();
  const m = readMap();
  const out = new Set<string>();
  for (const c of convs) {
    const readAt = m[c.phone] ?? base;
    for (const msg of c.messages) {
      if (msg.role === "user" && new Date(msg.ts).getTime() > readAt) {
        out.add(c.phone);
        break;
      }
    }
  }
  return out;
}

export type WaUnreadThread = { phone: string; name: string | null; preview: string };

// Unread thread details for the dashboard Follow-up card. Non-master admins
// get a 401 from the API → empty list, so callers need no role plumbing.
export async function fetchWaUnreadThreads(): Promise<WaUnreadThread[]> {
  const r = await fetch("/api/wa-inbox/messages", { cache: "no-store" });
  if (!r.ok) return [];
  const data = await r.json();
  type Conv = UnreadConv & { name: string | null; last_body: string; messages: { role: string; ts: string; body: string }[] };
  const convs: Conv[] = data.conversations || [];
  const unread = unreadPhones(convs);
  return convs
    .filter((c) => unread.has(c.phone))
    .map((c) => {
      const lastIn = [...c.messages].reverse().find((m) => m.role === "user");
      return { phone: c.phone, name: c.name, preview: lastIn?.body || c.last_body || "" };
    });
}

// Fetch + count in one place so the sidebar badge and the dashboard agree.
export async function fetchWaUnreadCount(): Promise<number> {
  return (await fetchWaUnreadThreads()).length;
}
