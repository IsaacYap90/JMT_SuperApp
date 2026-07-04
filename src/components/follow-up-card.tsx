"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWaUnreadThreads, WaUnreadThread } from "@/lib/wa-unread";

export type FollowUpItem = {
  id: string;
  tone: "red" | "blue" | "amber";
  label: string;
  detail: string;
  href: string;
};

const DOT: Record<FollowUpItem["tone"], string> = {
  red: "bg-red-500",
  blue: "bg-jai-blue",
  amber: "bg-amber-400",
};

// Client half of the Follow-up card: merges the server-derived action items
// with unread WhatsApp threads (per-device read state, polls every 30s).
export function FollowUpCard({ serverItems }: { serverItems: FollowUpItem[] }) {
  const [waThreads, setWaThreads] = useState<WaUnreadThread[]>([]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const t = await fetchWaUnreadThreads();
        if (!stop) setWaThreads(t);
      } catch {
        /* offline — keep last value */
      }
    };
    load();
    const t = setInterval(load, 30000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const waItems: FollowUpItem[] = waThreads.map((t) => ({
    id: `wa-${t.phone}`,
    tone: "red",
    label: `Reply ${t.name || `+${t.phone}`}`,
    detail: t.preview.length > 60 ? t.preview.slice(0, 57) + "..." : t.preview,
    href: `/wa-inbox?contact=${t.phone}`,
  }));

  // WhatsApp first — that's the one Jeremy cares most about.
  const items = [...waItems, ...serverItems];

  return (
    <div className="bg-jai-card border border-jai-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Follow up</h3>
        {items.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold min-w-[22px] h-[22px] rounded-full px-1.5 flex items-center justify-center">
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-white/80">All clear — nothing waiting on you.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className="flex items-center gap-3 py-2 group">
                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[it.tone]}`} aria-hidden />
                <span className="flex-1 min-w-0 text-sm text-white group-hover:underline truncate">
                  <span className={`font-semibold ${it.tone === "red" ? "text-red-400" : "text-white"}`}>
                    {it.label}
                  </span>
                  <span className="text-white/80"> — {it.detail}</span>
                </span>
                <svg className="w-4 h-4 text-white/70 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
