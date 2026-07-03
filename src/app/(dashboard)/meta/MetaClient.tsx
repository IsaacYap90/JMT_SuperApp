// JAI Meta assistant for JMT OS (master_admin / Jeremy). Unanswered Facebook +
// Instagram COMMENTS and DMs (enquiries only) each with a JAI-drafted reply Jeremy
// can edit, send, or dismiss — plus a "Done" activity log with verify links.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Kind = "comment" | "dm";
type Item = {
  kind: Kind;
  id: string;
  platform: "facebook" | "instagram";
  author: string | null;
  text: string | null; // the comment / the customer's message
  context: string | null; // post caption (comments only)
  permalink: string | null; // comments only
  draft_reply: string | null;
  status: string;
  replied_text: string | null;
  ts: string | null; // comment_created_at / last_message_at
  replied_at: string | null;
};

function fmtTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore",
  });
}
function dayKeySGT(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function fmtDayHeading(iso: string): string {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const msg = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const tk = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const mk = `${msg.getFullYear()}-${msg.getMonth()}-${msg.getDate()}`;
  if (tk === mk) return "Today";
  const ydy = new Date(today);
  ydy.setDate(ydy.getDate() - 1);
  if (`${ydy.getFullYear()}-${ydy.getMonth()}-${ydy.getDate()}` === mk) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-SG", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
  });
}

function Badge({ platform, kind }: { platform: "facebook" | "instagram"; kind: Kind }) {
  const label = `${platform === "instagram" ? "Instagram" : "Facebook"} ${kind === "dm" ? "DM" : "comment"}`;
  const cls =
    platform === "instagram"
      ? "from-fuchsia-500/20 to-amber-500/20 text-fuchsia-300 border-fuchsia-500/30"
      : "from-blue-500/20 to-blue-500/20 text-blue-300 border-blue-500/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r ${cls} border`}>
      {label}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapComment(c: any): Item {
  return {
    kind: "comment",
    id: c.id,
    platform: c.platform,
    author: c.author_name,
    text: c.comment_text,
    context: c.post_caption,
    permalink: c.permalink,
    draft_reply: c.draft_reply,
    status: c.status,
    replied_text: c.replied_text,
    ts: c.comment_created_at,
    replied_at: c.replied_at,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDm(d: any): Item {
  return {
    kind: "dm",
    id: d.id,
    platform: d.platform,
    author: d.participant_name,
    text: d.last_user_message,
    context: null,
    permalink: null,
    draft_reply: d.draft_reply,
    status: d.status,
    replied_text: d.replied_text,
    ts: d.last_message_at,
    replied_at: d.replied_at,
  };
}

export default function MetaClient() {
  const [pending, setPending] = useState<Item[]>([]);
  const [done, setDone] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, "send" | "dismiss" | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"comment" | "dm" | "done">("comment");
  const [toast, setToast] = useState<string | null>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      const [cr, dr] = await Promise.all([
        fetch("/api/meta/comments", { cache: "no-store" }),
        fetch("/api/meta/dms", { cache: "no-store" }),
      ]);
      const c = cr.ok ? await cr.json() : { pending: [], done: [] };
      const d = dr.ok ? await dr.json() : { pending: [], done: [] };
      const p: Item[] = [...(c.pending || []).map(mapComment), ...(d.pending || []).map(mapDm)];
      const done2: Item[] = [...(c.done || []).map(mapComment), ...(d.done || []).map(mapDm)];
      p.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
      setPending(p);
      setDone(done2);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const it of p) if (!(it.id in next)) next[it.id] = it.draft_reply || "";
        return next;
      });
    } catch {
      /* transient */
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/meta/refresh", { method: "POST" });
      await load();
    } catch {
      /* transient */
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    refresh();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [refresh, load]);

  const send = async (it: Item) => {
    const message = (draftsRef.current[it.id] || "").trim();
    if (!message) return flash("Write a reply first");
    setBusy((b) => ({ ...b, [it.id]: "send" }));
    try {
      const r = await fetch("/api/meta/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, message, kind: it.kind }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        flash(it.kind === "dm" ? "Reply sent ✅" : "Reply posted ✅");
        setPending((list) => list.filter((x) => x.id !== it.id));
      } else {
        flash(data.error || "Send failed");
      }
    } catch {
      flash("Network error");
    } finally {
      setBusy((b) => ({ ...b, [it.id]: null }));
    }
  };

  const dismiss = async (it: Item) => {
    setBusy((b) => ({ ...b, [it.id]: "dismiss" }));
    try {
      const r = await fetch("/api/meta/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, kind: it.kind }),
      });
      if (r.ok) setPending((list) => list.filter((x) => x.id !== it.id));
      else flash("Dismiss failed");
    } catch {
      flash("Network error");
    } finally {
      setBusy((b) => ({ ...b, [it.id]: null }));
    }
  };

  const comments = pending.filter((i) => i.kind === "comment");
  const dms = pending.filter((i) => i.kind === "dm");
  const visible = tab === "comment" ? comments : tab === "dm" ? dms : [];

  const doneGroups: { key: string; heading: string; items: Item[] }[] = [];
  for (const it of done) {
    const iso = it.replied_at || it.ts;
    if (!iso) continue;
    const key = dayKeySGT(iso);
    let g = doneGroups.find((x) => x.key === key);
    if (!g) {
      g = { key, heading: fmtDayHeading(iso), items: [] };
      doneGroups.push(g);
    }
    g.items.push(it);
  }

  const tabs: { id: "comment" | "dm" | "done"; label: string }[] = [
    { id: "comment", label: `Comments${comments.length ? ` (${comments.length})` : ""}` },
    { id: "dm", label: `DMs${dms.length ? ` (${dms.length})` : ""}` },
    { id: "done", label: "Done" },
  ];

  return (
    <div className="max-w-2xl mx-auto text-gray-100">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">
            JAI <span className="text-jai-blue">Meta</span>
          </h1>
          <p className="text-xs text-jai-text/60 mt-1">
            Facebook &amp; Instagram enquiries — JAI drafts, you approve.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-jai-card border border-jai-border text-jai-text/80 hover:border-jai-blue/50 disabled:opacity-50 transition"
        >
          {refreshing ? "Checking…" : "↻ Refresh"}
        </button>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-xl bg-jai-card border border-jai-border w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition ${
              tab === t.id ? "bg-jai-blue text-white" : "text-jai-text/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-500 text-center py-10">Loading…</p>}

      {/* ── Comments / DMs (needs reply) ─────────────────────────── */}
      {tab !== "done" && !loading && (
        <>
          {visible.length === 0 ? (
            <div className="text-center py-16 border border-jai-border rounded-2xl bg-jai-card">
              <p className="text-sm text-gray-400">All caught up 🎉</p>
              <p className="text-xs text-gray-500 mt-1">
                No {tab === "dm" ? "DMs" : "comments"} waiting for a reply.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((it) => (
                <li key={it.id} className="p-4 rounded-2xl bg-jai-card border border-jai-border">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge platform={it.platform} kind={it.kind} />
                      <span className="text-sm font-semibold text-white truncate">
                        {it.author || "Someone"}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0">
                      {fmtTime(it.ts)}
                    </span>
                  </div>

                  {it.context && (
                    <p className="text-[11px] text-gray-500 mb-1 line-clamp-1">on: {it.context}</p>
                  )}
                  <p className="text-sm text-gray-200 mb-3 whitespace-pre-wrap">
                    “{it.text || "(no text)"}”
                  </p>

                  <label className="text-[11px] uppercase tracking-wider text-jai-text/50 font-semibold">
                    JAI&apos;s draft reply
                  </label>
                  <textarea
                    value={drafts[it.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                    rows={it.kind === "dm" ? 3 : 2}
                    placeholder="Write a reply…"
                    className="mt-1 w-full text-sm bg-black/30 border border-jai-border rounded-xl px-3 py-2 text-white resize-y focus:outline-none focus:border-jai-blue/60"
                  />

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => send(it)}
                      disabled={busy[it.id] === "send"}
                      className="text-xs font-semibold px-4 py-2 rounded-lg bg-jai-blue text-white hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {busy[it.id] === "send" ? "Sending…" : it.kind === "dm" ? "Send DM" : "Send reply"}
                    </button>
                    <button
                      onClick={() => dismiss(it)}
                      disabled={busy[it.id] === "dismiss"}
                      className="text-xs font-medium px-3 py-2 rounded-lg text-jai-text/60 hover:text-white hover:bg-white/5 disabled:opacity-50 transition"
                    >
                      {busy[it.id] === "dismiss" ? "…" : "Dismiss"}
                    </button>
                    {it.permalink && (
                      <a
                        href={it.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-[11px] text-jai-blue/80 hover:text-jai-blue inline-flex items-center gap-1"
                      >
                        View on {it.platform === "instagram" ? "Instagram" : "Facebook"}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── Done / activity log ─────────────────────────────────── */}
      {tab === "done" && !loading && (
        <>
          {done.length === 0 ? (
            <div className="text-center py-16 border border-jai-border rounded-2xl bg-jai-card">
              <p className="text-sm text-gray-400">Nothing handled yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {doneGroups.map((g) => (
                <section key={g.key}>
                  <h2 className="text-[11px] uppercase tracking-wider text-jai-text/50 font-semibold mb-2 px-1">
                    {g.heading}
                  </h2>
                  <ul className="space-y-2">
                    {g.items.map((it) => (
                      <li key={it.id} className="p-3 rounded-xl bg-jai-card border border-jai-border">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge platform={it.platform} kind={it.kind} />
                            <span className="text-sm font-medium text-white truncate">
                              {it.status === "replied" ? `JAI replied to ${it.author || "someone"}` : "Dismissed"}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0">
                            {fmtTime(it.replied_at)}
                          </span>
                        </div>
                        {it.status === "replied" && it.replied_text && (
                          <p className="text-xs text-gray-300 mt-0.5">“{it.replied_text}”</p>
                        )}
                        {it.text && (
                          <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">re: {it.text}</p>
                        )}
                        {it.permalink && (
                          <a
                            href={it.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-jai-blue/80 hover:text-jai-blue mt-1 inline-flex items-center gap-1"
                          >
                            Verify on {it.platform === "instagram" ? "Instagram" : "Facebook"}
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/80 border border-jai-border text-gray-100 text-xs px-4 py-2 rounded-lg z-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
