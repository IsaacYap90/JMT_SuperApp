// Native WhatsApp inbox for JMT OS (master_admin / Jeremy). Reads jai.conversations
// via /api/wa-inbox/messages (polls 2s), replies via /send, pause-AI via /pause.
// Ported from the standalone JAI Inbox — no login (JMT OS handles auth) and sized
// to fit inside the dashboard layout.
"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type Role = "user" | "assistant";
type Msg = { id: string; role: Role; body: string; via?: string | null; ts: string };
type Conv = {
  phone: string;
  name: string | null;
  last_ts: string;
  last_body: string;
  last_role: Role;
  paused: boolean;
  messages: Msg[];
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
}
function dayKeySGT(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function fmtDateDivider(iso: string): string {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const msg = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const tk = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const mk = `${msg.getFullYear()}-${msg.getMonth()}-${msg.getDate()}`;
  if (tk === mk) return "Today";
  const ydy = new Date(today); ydy.setDate(ydy.getDate() - 1);
  if (`${ydy.getFullYear()}-${ydy.getMonth()}-${ydy.getDate()}` === mk) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
}
function initialOf(name: string | null, phone: string): string {
  if (name && name.trim() && /[a-zA-Z]/.test(name.trim()[0])) return name.trim()[0].toUpperCase();
  return phone.slice(-2);
}
const AVATAR_COLORS = ["bg-rose-500", "bg-amber-500", "bg-blue-500", "bg-sky-500", "bg-violet-500", "bg-pink-500", "bg-teal-500", "bg-orange-500"];
function avatarColor(phone: string): string {
  let h = 0;
  for (let i = 0; i < phone.length; i++) h = (h * 31 + phone.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function WaInboxClient() {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadContainerRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const r = await fetch("/api/wa-inbox/messages", { cache: "no-store" });
      if (!r.ok) { setErr("Fetch failed"); return; }
      const data = await r.json();
      setConversations(data.conversations || []);
    } catch {
      setErr("Network error");
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    const t = setInterval(fetchMessages, 2000);
    return () => clearInterval(t);
  }, [fetchMessages]);

  // Jump to the latest message when a conversation is opened.
  useEffect(() => {
    if (selected && threadEndRef.current) threadEndRef.current.scrollIntoView();
  }, [selected]);

  // On new messages (2s poll), only follow to the bottom if the user is already
  // near it — so scrolling up to read history isn't yanked back down.
  useEffect(() => {
    const el = threadContainerRef.current;
    if (!el || !threadEndRef.current) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) threadEndRef.current.scrollIntoView();
  }, [conversations]);

  const active = conversations.find((c) => c.phone === selected);
  const showThreadOnly = !!active;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? conversations.filter((c) => (c.name || "").toLowerCase().includes(q) || c.phone.includes(q) || c.last_body.toLowerCase().includes(q))
    : conversations;

  return (
    // Fill the dashboard content area (viewport minus fixed top bar + bottom nav).
    <div className="-mx-4 md:-mx-6 lg:-mx-8 h-[calc(100vh-9.5rem)] flex bg-jai-bg text-gray-100 overflow-hidden">
      {/* Conversation list */}
      <aside className={`${showThreadOnly ? "hidden" : "flex"} md:flex w-full md:w-[320px] shrink-0 border-r border-jai-border bg-jai-card flex-col min-h-0`}>
        <div className="px-3 py-2.5 border-b border-jai-border shrink-0">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, message"
            className="w-full bg-jai-bg border border-jai-border rounded-full px-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-jai-blue placeholder:text-gray-500" />
        </div>
        <ul className="overflow-y-auto flex-1">
          {conversations.length === 0 && <li className="px-4 py-6 text-sm text-gray-500 text-center">No conversations yet.</li>}
          {q && filtered.length === 0 && <li className="px-4 py-6 text-sm text-gray-500 text-center">No matches for &ldquo;{search}&rdquo;.</li>}
          {filtered.map((c) => {
            const isActive = c.phone === selected;
            return (
              <li key={c.phone}>
                <button onClick={() => setSelected(c.phone)}
                  className={`w-full text-left px-3 py-3 border-b border-jai-border/50 hover:bg-white/5 transition flex items-start gap-3 ${isActive ? "bg-jai-blue/10" : ""}`}>
                  <div className={`w-10 h-10 rounded-full ${avatarColor(c.phone)} text-white text-sm font-semibold flex items-center justify-center shrink-0`}>
                    {initialOf(c.name, c.phone)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-baseline gap-2">
                      <p className="text-sm font-medium text-white truncate">{c.name || `+${c.phone}`}</p>
                      <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0">{fmtTime(c.last_ts)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {c.paused && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">Jeremy</span>}
                      <p className="text-xs line-clamp-1 flex-1 text-gray-400">
                        <span className="text-gray-500">{c.last_role === "assistant" ? "JAI: " : ""}</span>{c.last_body}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Thread */}
      <section className={`${showThreadOnly ? "flex" : "hidden md:flex"} flex-1 bg-jai-bg flex-col min-h-0`}>
        {!active && <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a conversation</div>}
        {active && (
          <>
            <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-jai-border bg-jai-card flex items-center gap-2 sm:gap-3">
              <button onClick={() => setSelected(null)} className="md:hidden -ml-1 p-1.5 text-gray-400 hover:text-white rounded shrink-0" aria-label="Back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div className={`w-9 h-9 rounded-full ${avatarColor(active.phone)} text-white text-sm font-semibold flex items-center justify-center shrink-0`}>{initialOf(active.name, active.phone)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{active.name || `+${active.phone}`}</p>
                <p className="text-[11px] text-gray-500 font-mono truncate">+{active.phone}</p>
              </div>
              <button
                onClick={async () => {
                  const next = !active.paused;
                  const r = await fetch("/api/wa-inbox/pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: active.phone, paused: next }) });
                  if (r.ok) fetchMessages(); else setErr("Toggle failed");
                }}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition shrink-0 ${active.paused ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" : "bg-jai-blue/20 text-jai-blue hover:bg-jai-blue/30"}`}
                title={active.paused ? "AI paused — Jeremy replying. Tap to hand back to AI." : "AI on. Tap to take over."}
              >
                {active.paused ? "Jeremy taking over" : "AI on"}
              </button>
            </div>

            <div ref={threadContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-2">
              {(() => {
                const els: React.ReactNode[] = [];
                let prevDay = "";
                for (const m of active.messages) {
                  const dk = dayKeySGT(m.ts);
                  if (dk !== prevDay) {
                    els.push(
                      <div key={`d-${dk}-${m.id}`} className="flex justify-center my-2">
                        <span className="bg-white/10 text-gray-300 text-[10px] uppercase tracking-wider px-3 py-1 rounded-full">{fmtDateDivider(m.ts)}</span>
                      </div>
                    );
                    prevDay = dk;
                  }
                  const isOut = m.role === "assistant";
                  els.push(
                    <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${isOut ? "bg-jai-blue text-white rounded-br-sm" : "bg-jai-card text-gray-100 rounded-bl-sm"}`}>
                        {isOut && (
                          <div className={`text-[11px] font-bold mb-0.5 ${m.via === "human" ? "text-amber-200" : "text-white/90"}`}>
                            {m.via === "human" ? "Coach Jeremy" : "Jai"}
                          </div>
                        )}
                        <div>{m.body}</div>
                        <div className={`text-[10px] mt-1 ${isOut ? "text-white/70" : "text-gray-400"}`}>{fmtTime(m.ts)}</div>
                      </div>
                    </div>
                  );
                }
                return els;
              })()}
              <div ref={threadEndRef} />
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const body = draft.trim();
                if (!body || sending) return;
                setSending(true); setErr(null);
                try {
                  const r = await fetch("/api/wa-inbox/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: active.phone, body }) });
                  if (r.ok) { setDraft(""); fetchMessages(); }
                  else { const j = await r.json().catch(() => ({})); setErr(j.error || "Send failed"); }
                } catch { setErr("Network error"); }
                finally { setSending(false); }
              }}
              className="border-t border-jai-border bg-jai-card px-3 sm:px-4 py-2.5 sm:py-3 flex items-end gap-2 shrink-0"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit(); } }}
                rows={1}
                placeholder={active.paused ? "Reply as Jeremy (AI paused)" : "Reply manually — toggle AI off first"}
                className="flex-1 resize-none border border-jai-border bg-jai-bg text-gray-100 placeholder:text-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-jai-blue max-h-32"
              />
              <button type="submit" disabled={!draft.trim() || sending} className="bg-jai-blue hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition shrink-0">
                {sending ? "…" : "Send"}
              </button>
            </form>
          </>
        )}
      </section>

      {err && <div className="fixed bottom-24 right-4 bg-red-500/20 text-red-300 text-xs px-4 py-2 rounded z-50">{err}</div>}
    </div>
  );
}
