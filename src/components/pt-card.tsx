"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PtSession } from "@/lib/types/database";
import { coachUpdatePtStatus, coachReschedulePtSession } from "@/app/actions/pt";

const TIME_SLOTS = Array.from({ length: 33 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const label = `${h12}:${String(m).padStart(2, "0")}${suffix}`;
  return { value, label };
});

export function PtCard({ s, isPast, showDate }: { s: PtSession; isPast?: boolean; showDate?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(s.status);
  const [updating, setUpdating] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newDuration, setNewDuration] = useState(s.duration_minutes || 60);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const dt = new Date(s.scheduled_at);
  const time = dt.toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  });
  const dayLabel = showDate
    ? dt.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "Asia/Singapore",
      })
    : null;

  const endDt = new Date(dt.getTime() + (s.duration_minutes || 60) * 60000);
  const endTime = endDt.toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  });

  const isResolved = status === "completed" || status === "cancelled" || status === "no_show";

  const handleStatus = async (newStatus: "completed" | "cancelled" | "no_show") => {
    setUpdating(newStatus);
    try {
      await coachUpdatePtStatus(s.id, newStatus);
      setStatus(newStatus);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
    setUpdating(null);
  };

  const openReschedule = () => {
    // Pre-fill with current date/time in SGT
    const sgt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    const yyyy = sgt.getFullYear();
    const mm = String(sgt.getMonth() + 1).padStart(2, "0");
    const dd = String(sgt.getDate()).padStart(2, "0");
    const hh = String(sgt.getHours()).padStart(2, "0");
    const mi = String(sgt.getMinutes()).padStart(2, "0");
    setNewDate(`${yyyy}-${mm}-${dd}`);
    setNewTime(`${hh}:${mi}`);
    setNewDuration(s.duration_minutes || 60);
    setRescheduling(true);
  };

  const handleReschedule = async () => {
    if (!newDate || !newTime) return;
    setSaving(true);
    try {
      // Construct ISO string in SGT (UTC+8) then convert to UTC ISO
      const localISO = `${newDate}T${newTime}:00+08:00`;
      const utcISO = new Date(localISO).toISOString();
      await coachReschedulePtSession(s.id, utcISO, newDuration);
      setRescheduling(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reschedule");
    }
    setSaving(false);
  };

  return (
    <div
      className={`bg-jai-card border rounded-xl p-4 transition-colors ${
        isResolved
          ? status === "completed" ? "border-green-500/20" : status === "no_show" ? "border-amber-500/20" : "border-red-500/20"
          : isPast ? "border-jai-border opacity-40" : "border-jai-border cursor-pointer active:bg-jai-card/80"
      }`}
      onClick={() => !isResolved && setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">
            PT — {s.member?.full_name || "Client"}
          </p>
          <p className="text-jai-text text-sm">
            {dayLabel ? `${dayLabel} · ` : ""}{time} - {endTime} · {s.duration_minutes || 60}min
          </p>
        </div>
        {isResolved ? (
          <span className={`text-[10px] px-2 py-1 rounded-full ${
            status === "completed"
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : status === "no_show"
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>
            {status === "completed" ? "Done" : status === "no_show" ? "No Show" : "Cancelled"}
          </span>
        ) : (
          <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            PT
          </span>
        )}
      </div>

      {expanded && !isResolved && (
        <div className="mt-3 pt-3 border-t border-jai-border space-y-3">
          {s.member?.phone && (
            <a href={`tel:${s.member.phone}`} className="flex items-center gap-2 text-jai-blue text-sm hover:underline">
              <span>📞</span> {s.member.phone}
            </a>
          )}
          {!rescheduling && (
            <button
              onClick={(e) => { e.stopPropagation(); openReschedule(); }}
              className="w-full py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            >
              📅 Reschedule
            </button>
          )}
          {rescheduling && (
            <div className="space-y-2 bg-jai-bg/40 p-3 rounded-lg border border-jai-border" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] text-jai-text/60 uppercase tracking-wider">Reschedule session</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="bg-jai-card border border-jai-border rounded-md px-2 py-1.5 text-xs"
                />
                <select
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="bg-jai-card border border-jai-border rounded-md px-2 py-1.5 text-xs"
                >
                  <option value="">Time</option>
                  {TIME_SLOTS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <select
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
                className="w-full bg-jai-card border border-jai-border rounded-md px-2 py-1.5 text-xs"
              >
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
              </select>
              <p className="text-[10px] text-jai-text/50">Jeremy will be notified of the change.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleReschedule}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setRescheduling(false)}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-jai-card border border-jai-border text-jai-text/70 hover:bg-jai-card/60 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleStatus("completed"); }}
              disabled={updating !== null}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
            >
              {updating === "completed" ? "..." : "Completed"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleStatus("no_show"); }}
              disabled={updating !== null}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
            >
              {updating === "no_show" ? "..." : "No Show"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleStatus("cancelled"); }}
              disabled={updating !== null}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {updating === "cancelled" ? "..." : "Cancelled"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
