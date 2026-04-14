"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PtSession } from "@/lib/types/database";
import { coachUpdatePtStatus, coachReschedulePtSession } from "@/app/actions/pt";
import { SessionCompleteDialog, CompletePayload } from "@/components/session-complete-dialog";
import { DatePickerSheet } from "@/components/date-picker-sheet";
import { showToast } from "@/components/toast";
import { haptic } from "@/lib/haptic";

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
  const [showComplete, setShowComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
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
    const prev = status;
    setStatus(newStatus);
    setUpdating(newStatus);
    haptic("tap");
    try {
      await coachUpdatePtStatus(s.id, newStatus);
      haptic("success");
      showToast(
        newStatus === "no_show"
          ? `Marked as no-show — ${s.member?.full_name || "client"}`
          : newStatus === "cancelled"
          ? `Cancelled — ${s.member?.full_name || "client"}`
          : `Completed — ${s.member?.full_name || "client"}`
      );
      router.refresh();
    } catch (err) {
      setStatus(prev);
      haptic("error");
      showToast(err instanceof Error ? err.message : "Failed to update", "error");
    }
    setUpdating(null);
  };

  const handleComplete = async (payload: CompletePayload) => {
    const prev = status;
    setStatus("completed");
    setShowComplete(false);
    setCompleting(true);
    haptic("tap");
    try {
      await coachUpdatePtStatus(s.id, "completed", payload);
      haptic("success");
      const paidBit = payload.paid_amount != null ? ` · $${payload.paid_amount} collected` : "";
      showToast(`Completed — ${s.member?.full_name || "client"}${paidBit}`);
      router.refresh();
    } catch (err) {
      setStatus(prev);
      haptic("error");
      showToast(err instanceof Error ? err.message : "Failed to complete", "error");
    }
    setCompleting(false);
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
    haptic("tap");
    try {
      const localISO = `${newDate}T${newTime}:00+08:00`;
      const utcISO = new Date(localISO).toISOString();
      await coachReschedulePtSession(s.id, utcISO, newDuration);
      haptic("success");
      setRescheduling(false);
      showToast(`Rescheduled — ${s.member?.full_name || "client"} · Jeremy notified`);
      router.refresh();
    } catch (err) {
      haptic("error");
      showToast(err instanceof Error ? err.message : "Failed to reschedule", "error");
    }
    setSaving(false);
  };

  return (
    <div
      className={`bg-jai-card border rounded-xl p-4 transition-colors relative overflow-hidden ${
        isResolved
          ? status === "completed" ? "border-green-500/20" : status === "no_show" ? "border-amber-500/20" : "border-red-500/20"
          : isPast ? "border-jai-border opacity-40" : "border-jai-border cursor-pointer active:bg-jai-card/80"
      }`}
      style={swipeX !== 0 ? { transform: `translateX(${swipeX}px)`, transition: "none" } : { transform: "translateX(0)", transition: "transform 200ms" }}
      onClick={() => !isResolved && setExpanded(!expanded)}
      onTouchStart={(e) => {
        if (isResolved || isPast || rescheduling) return;
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchMove={(e) => {
        if (!touchStart.current) return;
        const dx = e.touches[0].clientX - touchStart.current.x;
        const dy = e.touches[0].clientY - touchStart.current.y;
        if (Math.abs(dy) > Math.abs(dx)) return;
        if (dx > 0) setSwipeX(Math.min(dx, 160));
      }}
      onTouchEnd={() => {
        const dx = swipeX;
        touchStart.current = null;
        setSwipeX(0);
        if (dx > 80) setShowComplete(true);
      }}
    >
      {swipeX > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-4 text-green-400 pointer-events-none"
          style={{ width: swipeX, opacity: Math.min(swipeX / 80, 1) }}
        >
          <span className="text-xs font-semibold">✓ Complete</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm flex items-center gap-1.5">
            PT — {s.member?.full_name || "Client"}
            {s.package?.guardian_name && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/25 font-normal uppercase tracking-wider">
                kid
              </span>
            )}
          </p>
          <p className="text-jai-text text-sm">
            {dayLabel ? `${dayLabel} · ` : ""}{time} - {endTime} · {s.duration_minutes || 60}min
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(() => {
            // One morphing pill. Pay info takes priority; otherwise show status.
            if (s.paid_amount != null) {
              return (
                <span className="text-[10px] px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  💵 ${s.paid_amount}
                </span>
              );
            }
            if (!isResolved && s.member?.pt_pay_per_class && s.member?.pt_default_price_per_class != null) {
              return (
                <span className="text-[10px] px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  ${s.member.pt_default_price_per_class}/class
                </span>
              );
            }
            return null;
          })()}
          {isResolved && (
            <span className={`text-[10px] px-2 py-1 rounded-full ${
              status === "completed"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : status === "no_show"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>
              {status === "completed" ? "Done" : status === "no_show" ? "No Show" : "Cancelled"}
            </span>
          )}
        </div>
      </div>

      {expanded && !isResolved && (
        <div className="mt-3 pt-3 border-t border-jai-border space-y-3">
          {(() => {
            const contactPhone = s.package?.guardian_phone || s.member?.phone || "";
            const contactLabel = s.package?.guardian_name
              ? `${contactPhone} (${s.package.guardian_name})`
              : contactPhone;
            return contactPhone ? (
              <a href={`tel:${contactPhone}`} className="flex items-center gap-2 text-jai-blue text-sm hover:underline">
                <span>📞</span> {contactLabel}
              </a>
            ) : null;
          })()}
          {!rescheduling && (
            <button
              onClick={(e) => { e.stopPropagation(); openReschedule(); }}
              className="w-full min-h-[44px] py-2.5 text-sm font-medium rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            >
              📅 Reschedule
            </button>
          )}
          {rescheduling && (
            <div className="space-y-2 bg-jai-bg/40 p-3 rounded-lg border border-jai-border" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] text-jai-text/60 uppercase tracking-wider">Reschedule session</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  className="bg-jai-card border border-jai-border rounded-md px-2 py-1.5 text-xs text-left"
                >
                  {newDate
                    ? new Date(newDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
                    : "Pick date"}
                </button>
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
                  className="flex-1 min-h-[44px] py-2.5 text-sm font-medium rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setRescheduling(false)}
                  disabled={saving}
                  className="flex-1 min-h-[44px] py-2.5 text-sm font-medium rounded-lg bg-jai-card border border-jai-border text-jai-text/70 hover:bg-jai-card/60 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowComplete(true); }}
              disabled={updating !== null}
              className="flex-1 min-h-[44px] py-2.5 text-sm font-medium rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
            >
              Completed
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleStatus("no_show"); }}
              disabled={updating !== null}
              className="flex-1 min-h-[44px] py-2.5 text-sm font-medium rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
            >
              {updating === "no_show" ? "..." : "No Show"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleStatus("cancelled"); }}
              disabled={updating !== null}
              className="flex-1 min-h-[44px] py-2.5 text-sm font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {updating === "cancelled" ? "..." : "Cancelled"}
            </button>
          </div>
        </div>
      )}
      <SessionCompleteDialog
        open={showComplete}
        memberName={s.member?.full_name || "Client"}
        saving={completing}
        payPerClass={!!s.member?.pt_pay_per_class}
        defaultPrice={s.member?.pt_default_price_per_class ?? null}
        onCancel={() => setShowComplete(false)}
        onConfirm={handleComplete}
      />
      <DatePickerSheet
        open={showDatePicker}
        value={newDate}
        onChange={setNewDate}
        onClose={() => setShowDatePicker(false)}
        title="Reschedule to"
      />
    </div>
  );
}
