"use client";

import { Class, PtSession } from "@/lib/types/database";

export type NextUpTimelineItem =
  | { type: "class"; sortKey: string; data: Class }
  | { type: "pt"; sortKey: string; data: PtSession };

function sgtNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
}

function fmt12(hh: number, mm: number): string {
  const suffix = hh >= 12 ? "pm" : "am";
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${h12}:${String(mm).padStart(2, "0")}${suffix}`;
}

function formatHint(minutes: number, isLeft: boolean): string {
  if (isLeft) {
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : `${minutes}m left`;
  }
  return minutes >= 60 ? `in ${Math.floor(minutes / 60)}h ${minutes % 60}m` : `in ${minutes}m`;
}

export function NextUpStrip({ items, disabled }: { items: NextUpTimelineItem[]; disabled?: boolean }) {
  if (disabled || items.length === 0) return null;

  const now = sgtNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let nextIdx = -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === "class") {
      const [eh, em] = item.data.end_time.split(":").map(Number);
      if (nowMin < eh * 60 + em) {
        nextIdx = i;
        break;
      }
    } else {
      const s = item.data;
      const endMs = new Date(s.scheduled_at).getTime() + (s.duration_minutes || 60) * 60000;
      const endSgt = new Date(new Date(endMs).toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
      const endMin = endSgt.getHours() * 60 + endSgt.getMinutes() + endSgt.getDate() * 24 * 60;
      const nowMinFull = nowMin + now.getDate() * 24 * 60;
      if (nowMinFull < endMin) {
        nextIdx = i;
        break;
      }
    }
  }
  if (nextIdx < 0) return null;

  const item = items[nextIdx];
  let title: string;
  let timeRange: string;
  let hint: string;
  let isNow: boolean;

  if (item.type === "class") {
    const cls = item.data;
    const [sh, sm] = cls.start_time.split(":").map(Number);
    const [eh, em] = cls.end_time.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    timeRange = `${fmt12(sh, sm)} – ${fmt12(eh, em)}`;
    isNow = nowMin >= startMin && nowMin < endMin;
    hint = isNow ? formatHint(endMin - nowMin, true) : formatHint(startMin - nowMin, false);
    title = cls.name;
  } else {
    const s = item.data;
    const dt = new Date(s.scheduled_at);
    const startSgt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    const startMin = startSgt.getHours() * 60 + startSgt.getMinutes();
    const dur = s.duration_minutes || 60;
    const endMin = startMin + dur;
    const endDt = new Date(dt.getTime() + dur * 60000);
    const endSgt = new Date(endDt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    timeRange = `${fmt12(startSgt.getHours(), startSgt.getMinutes())} – ${fmt12(endSgt.getHours(), endSgt.getMinutes())}`;
    isNow = nowMin >= startMin && nowMin < endMin;
    hint = isNow ? formatHint(endMin - nowMin, true) : formatHint(startMin - nowMin, false);
    title = `PT — ${s.member?.full_name || "Client"}`;
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${
        isNow ? "bg-jai-blue/15 border-jai-blue/40" : "bg-jai-card border-jai-border"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] uppercase tracking-wider font-medium ${isNow ? "text-jai-blue" : "text-jai-text/60"}`}>
          {isNow ? "● Now" : "Next up"}
        </p>
        <p className="text-sm font-semibold truncate">{title}</p>
        <p className="text-xs text-jai-text/70">{timeRange}</p>
      </div>
      <div className={`shrink-0 text-right ${isNow ? "text-jai-blue" : "text-jai-text"}`}>
        <p className="text-sm font-bold">{hint}</p>
      </div>
    </div>
  );
}
