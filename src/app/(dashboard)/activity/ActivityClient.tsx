// JAI Activity feed for JMT OS (master_admin / Jeremy). Reads a daily log of what the
// JAI WhatsApp assistant has done via /api/activity (polls 5s). Grouped by day in SGT,
// newest first. Every entry deep-links to the real thing so Jeremy can verify it.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type ActivityType = "reply" | "trial_booked" | "booking_link" | "followup" | "escalated";
type Activity = {
  id: string;
  type: ActivityType;
  ts: string;
  contact_number: string;
  contact_name: string | null;
  title: string;
  snippet: string | null;
  link: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-SG", {
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
    year: "numeric",
    timeZone: "Asia/Singapore",
  });
}

const TYPE_META: Record<ActivityType, { label: string; dot: string; icon: JSX.Element }> = {
  reply: {
    label: "Reply",
    dot: "bg-jai-blue",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.84L3 21l1.4-3.5A7.94 7.94 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    ),
  },
  trial_booked: {
    label: "Trial",
    dot: "bg-emerald-500",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    ),
  },
  booking_link: {
    label: "Booking link",
    dot: "bg-sky-500",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
    ),
  },
  followup: {
    label: "Follow-up",
    dot: "bg-violet-500",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    ),
  },
  escalated: {
    label: "Escalated",
    dot: "bg-amber-500",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
    ),
  },
};

export default function ActivityClient() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    try {
      const r = await fetch("/api/activity", { cache: "no-store" });
      if (!r.ok) {
        setErr("Fetch failed");
        return;
      }
      const data = await r.json();
      setActivities(data.activities || []);
      setErr(null);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
    const t = setInterval(fetchActivities, 5000);
    return () => clearInterval(t);
  }, [fetchActivities]);

  // Group by SGT day, preserving the newest-first order from the API.
  const groups: { key: string; heading: string; items: Activity[] }[] = [];
  for (const a of activities) {
    const key = dayKeySGT(a.ts);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, heading: fmtDayHeading(a.ts), items: [] };
      groups.push(g);
    }
    g.items.push(a);
  }

  return (
    <div className="max-w-2xl mx-auto text-gray-100">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-white">
          JAI <span className="text-jai-blue">Activity</span>
        </h1>
        <p className="text-xs text-jai-text/60 mt-1">What your WhatsApp assistant has been doing.</p>
      </div>

      {loading && activities.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-10">Loading…</p>
      )}

      {!loading && activities.length === 0 && (
        <div className="text-center py-16 border border-jai-border rounded-2xl bg-jai-card">
          <p className="text-sm text-gray-400">No activity yet today.</p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="text-[11px] uppercase tracking-wider text-jai-text/50 font-semibold mb-2 px-1">
              {g.heading}
            </h2>
            <ul className="space-y-2">
              {g.items.map((a) => {
                const meta = TYPE_META[a.type];
                return (
                  <li key={a.id}>
                    <Link
                      href={a.link}
                      className="flex items-start gap-3 p-3 rounded-xl bg-jai-card border border-jai-border hover:border-jai-blue/50 hover:bg-white/5 transition group"
                    >
                      <span className={`mt-0.5 w-8 h-8 rounded-full ${meta.dot} text-white flex items-center justify-center shrink-0`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {meta.icon}
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-baseline gap-2">
                          <p className="text-sm font-medium text-white truncate">{a.title}</p>
                          <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0">{fmtTime(a.ts)}</span>
                        </div>
                        {a.snippet && (
                          <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{a.snippet}</p>
                        )}
                        <span className="text-[11px] text-jai-blue/80 group-hover:text-jai-blue mt-1 inline-flex items-center gap-1">
                          {a.type === "trial_booked" ? "Open trial" : "Open chat"}
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {err && (
        <div className="fixed bottom-24 right-4 bg-red-500/20 text-red-300 text-xs px-4 py-2 rounded z-50">{err}</div>
      )}
    </div>
  );
}
