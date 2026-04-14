"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type CommandItem = {
  id: string;
  kind: "nav" | "coach" | "lead" | "member" | "class";
  label: string;
  hint?: string;
  href: string;
};

function scoreMatch(item: CommandItem, q: string): number {
  if (!q) return 0;
  const label = item.label.toLowerCase();
  const hint = (item.hint || "").toLowerCase();
  const query = q.toLowerCase();
  if (label === query) return 1000;
  if (label.startsWith(query)) return 500;
  if (label.includes(query)) return 100;
  if (hint.includes(query)) return 50;
  // fuzzy: all chars present in order
  let idx = 0;
  for (const ch of query) {
    const next = label.indexOf(ch, idx);
    if (next === -1) return 0;
    idx = next + 1;
  }
  return 10;
}

const KIND_ICON: Record<CommandItem["kind"], string> = {
  nav: "→",
  coach: "🥋",
  lead: "📩",
  member: "👤",
  class: "📅",
};

export function CommandPalette({ index }: { index: CommandItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) {
      // Show nav + top-level hints by default
      return index.filter((it) => it.kind === "nav").slice(0, 20);
    }
    const scored = index
      .map((it) => ({ it, score: scoreMatch(it, q.trim()) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    return scored.map((x) => x.it);
  }, [q, index]);

  useEffect(() => {
    if (selected >= results.length) setSelected(Math.max(0, results.length - 1));
  }, [results.length, selected]);

  function navigate(it: CommandItem) {
    setOpen(false);
    router.push(it.href);
  }

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-jai-card border border-jai-border rounded-xl shadow-xl overflow-hidden"
      >
        <div className="p-3 border-b border-jai-border">
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelected(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = results[selected];
                if (it) navigate(it);
              }
            }}
            placeholder="Search anything — coach, lead, member, class…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-jai-text/50"
          />
        </div>
        <ul ref={listRef} className="max-h-[60vh] overflow-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-3 text-xs text-jai-text/60">No results.</li>
          )}
          {results.map((it, idx) => (
            <li key={it.id}>
              <button
                onClick={() => navigate(it)}
                onMouseEnter={() => setSelected(idx)}
                className={`w-full text-left flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  idx === selected ? "bg-white/5 text-white" : "text-jai-text hover:bg-white/5"
                }`}
              >
                <span className="text-xs opacity-70 w-4 text-center">{KIND_ICON[it.kind]}</span>
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-[10px] text-jai-text/50 truncate">{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-jai-border flex items-center gap-3 text-[10px] text-jai-text/60">
          <span><kbd className="bg-jai-bg border border-jai-border rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="bg-jai-bg border border-jai-border rounded px-1">↵</kbd> open</span>
          <span><kbd className="bg-jai-bg border border-jai-border rounded px-1">Esc</kbd> close</span>
          <span className="ml-auto"><kbd className="bg-jai-bg border border-jai-border rounded px-1">⌘K</kbd></span>
        </div>
      </div>
    </div>
  );
}
