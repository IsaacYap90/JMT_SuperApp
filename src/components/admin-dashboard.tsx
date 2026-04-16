"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { Class, PtSession, User } from "@/lib/types/database";
import { getTodayHoliday } from "@/lib/sg-holidays";
import { NextUpStrip } from "@/components/next-up-strip";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { updatePtSession, updateSessionStatus } from "@/app/actions/pt";
import { SessionCompleteDialog, CompletePayload } from "@/components/session-complete-dialog";
import { showToast } from "@/components/toast";
import { haptic } from "@/lib/haptic";
import { TodayTrialsStrip, TrialRow } from "@/components/today-trials-strip";

function getSgtNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
}

function isClassPast(endTime: string): boolean {
  const now = getSgtNow();
  const [h, m] = endTime.split(":").map(Number);
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

function isPtPast(scheduledAt: string, durationMinutes: number): boolean {
  const now = getSgtNow();
  const end = new Date(new Date(scheduledAt).getTime() + durationMinutes * 60000);
  const endSgt = new Date(end.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return now >= endSgt;
}

function isClassNow(startTime: string, endTime: string): boolean {
  const now = getSgtNow();
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
}

function isPtNow(scheduledAt: string, durationMinutes: number): boolean {
  const now = getSgtNow();
  const start = new Date(new Date(scheduledAt).toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return now >= start && now < end;
}

function isClassNext(startTime: string, endTime: string, allStartTimes: string[]): boolean {
  const now = getSgtNow();
  const [sh, sm] = startTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [eh, em] = endTime.split(":").map(Number);
  const endMins = eh * 60 + em;
  if (nowMins >= endMins) return false; // past
  if (nowMins >= startMins) return false; // currently happening
  // Is this the earliest future item?
  const futureStarts = allStartTimes
    .map((t) => { const [h2, m2] = t.split(":").map(Number); return h2 * 60 + m2; })
    .filter((m) => m > nowMins);
  return futureStarts.length > 0 && startMins === Math.min(...futureStarts);
}

/** Colour for class type based on name keywords */
function classColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("kid")) return "border-l-orange-400";
  if (n.includes("teen")) return "border-l-purple-400";
  return "border-l-blue-400";
}

export function AdminDashboard({
  todayClasses,
  todayPtSessions,
  tomorrowClasses,
  tomorrowPtSessions,
  activePtPackages,
  pendingLeaves,
  today,
  userName,
  coaches,
  todayTrials = [],
  activityFeed,
}: {
  todayClasses: Class[];
  todayPtSessions: PtSession[];
  tomorrowClasses: Class[];
  tomorrowPtSessions: PtSession[];
  activePtPackages: number;
  pendingLeaves: number;
  today: string;
  userName: string;
  coaches: User[];
  todayTrials?: TrialRow[];
  activityFeed?: ReactNode;
}) {
  void today; // passed by page but date is computed inline
  const todayHoliday = getTodayHoliday();
  const classes = todayHoliday ? [] : todayClasses.sort((a, b) => a.start_time.localeCompare(b.start_time));
  const [ptSessions, setPtSessions] = useState<PtSession[]>(todayHoliday ? [] : todayPtSessions);

  // PT edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCoachId, setEditCoachId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState(60);
  const [saving, setSaving] = useState(false);

  // Complete-with-signature dialog state
  const [completeSession, setCompleteSession] = useState<PtSession | null>(null);
  const [completing, setCompleting] = useState(false);

  async function handleComplete(payload: CompletePayload) {
    if (!completeSession) return;
    const target = completeSession;
    const prevStatus = target.status;
    setPtSessions((prev) =>
      prev.map((s) => (s.id === target.id ? { ...s, status: "completed" } : s))
    );
    setCompleteSession(null);
    setEditingId(null);
    setCompleting(true);
    haptic("tap");
    try {
      await updateSessionStatus(target.id, "completed", payload);
      haptic("success");
      const paidBit = payload.paid_amount != null ? ` · $${payload.paid_amount} collected` : "";
      showToast(`Completed — ${target.member?.full_name || "client"}${paidBit}`);
    } catch (e) {
      setPtSessions((prev) =>
        prev.map((s) => (s.id === target.id ? { ...s, status: prevStatus } : s))
      );
      haptic("error");
      showToast(e instanceof Error ? e.message : "Failed to complete", "error");
    } finally {
      setCompleting(false);
    }
  }

  // Tomorrow collapsed
  const [tomorrowOpen, setTomorrowOpen] = useState(false);

  function openEdit(s: PtSession) {
    const dt = new Date(s.scheduled_at);
    const dateStr = dt.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const timeStr = dt.toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Singapore",
    });
    setEditingId(s.id);
    setEditCoachId(s.coach_id);
    setEditDate(dateStr);
    setEditTime(timeStr);
    setEditDuration(s.duration_minutes || 60);
  }

  async function handleSave(sessionId: string) {
    setSaving(true);
    try {
      const scheduled_at = new Date(`${editDate}T${editTime}:00+08:00`).toISOString();
      const updated = await updatePtSession(sessionId, {
        coach_id: editCoachId,
        scheduled_at,
        duration_minutes: editDuration,
      });
      setPtSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? (updated as unknown as PtSession) : s))
      );
      setEditingId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  // Build merged timeline sorted by time
  type TimelineItem = { type: "class"; sortKey: string; data: Class } | { type: "pt"; sortKey: string; data: PtSession };
  const timelineItems: TimelineItem[] = [];
  classes.forEach((cls) => timelineItems.push({ type: "class", sortKey: cls.start_time, data: cls }));
  ptSessions.forEach((s) => {
    const dt = new Date(s.scheduled_at);
    const sgt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    const hh = sgt.getHours().toString().padStart(2, "0");
    const mm = sgt.getMinutes().toString().padStart(2, "0");
    timelineItems.push({ type: "pt", sortKey: `${hh}:${mm}`, data: s });
  });
  timelineItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // All start times for NEXT detection
  const allStartTimes = timelineItems.map((item) => item.sortKey);

  // Tomorrow's merged timeline
  const tmrClasses = tomorrowClasses.slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
  const tomorrowItems: TimelineItem[] = [];
  tmrClasses.forEach((cls) => tomorrowItems.push({ type: "class", sortKey: cls.start_time, data: cls }));
  tomorrowPtSessions.forEach((s) => {
    const dt = new Date(s.scheduled_at);
    const sgt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    const hh = sgt.getHours().toString().padStart(2, "0");
    const mm = sgt.getMinutes().toString().padStart(2, "0");
    tomorrowItems.push({ type: "pt", sortKey: `${hh}:${mm}`, data: s });
  });
  tomorrowItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const tomorrowDateLabel = new Date(Date.now() + 86400000).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  });

  const firstName = userName.split(" ")[0];
  const shortDate = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  });

  // Tomorrow peek summary
  const tmrFirstTime = tomorrowItems.length > 0 ? tomorrowItems[0].sortKey.slice(0, 5) : "";
  const tmrSummary = tomorrowItems.length > 0
    ? `${tomorrowItems.length} session${tomorrowItems.length !== 1 ? "s" : ""} from ${tmrFirstTime}`
    : "Nothing scheduled";

  return (
    <PullToRefresh>
    <div className="space-y-5">
      {/* Compact header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{firstName}</h1>
          <p className="text-jai-text text-xs capitalize">{shortDate}</p>
        </div>
        {/* Quick stats pills */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-jai-card border border-jai-border text-jai-text">
            {classes.length} class{classes.length !== 1 ? "es" : ""}
          </span>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-jai-card border border-jai-border text-jai-text">
            {ptSessions.length} PT
          </span>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-jai-card border border-jai-border text-jai-text">
            {activePtPackages} active
          </span>
        </div>
      </div>

      {/* "Next up" glance strip */}
      <NextUpStrip items={timelineItems} disabled={!!todayHoliday} />

      {/* Today's trials — one-tap actions */}
      <TodayTrialsStrip trials={todayTrials} actionable={true} />

      {/* Today so far — activity feed */}
      {activityFeed}

      {/* Pending leave alert */}
      {pendingLeaves > 0 && (
        <Link
          href="/leave"
          className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 hover:bg-amber-500/15 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            <p className="text-sm text-amber-300 font-medium">
              {pendingLeaves} leave request{pendingLeaves !== 1 ? "s" : ""} pending
            </p>
          </div>
          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Today's Schedule */}
      <section>
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider mb-3">
          Today
        </h2>
        {todayHoliday ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="font-medium text-red-400">Gym Closed</p>
            <p className="text-red-400/70 text-sm">{todayHoliday.name}</p>
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="bg-jai-card border border-jai-border rounded-xl p-8 text-center space-y-1">
            <p className="text-2xl">📭</p>
            <p className="text-jai-text text-sm font-medium">Quiet day at the gym</p>
            <p className="text-jai-text/60 text-xs">No classes or PT sessions scheduled.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {timelineItems.map((item) => {
              if (item.type === "class") {
                const cls = item.data as Class;
                const past = isClassPast(cls.end_time);
                const now = isClassNow(cls.start_time, cls.end_time);
                const next = !now && !past && isClassNext(cls.start_time, cls.end_time, allStartTimes);
                return (
                  <Link
                    key={`class-${cls.id}`}
                    href="/schedule"
                    className={`block bg-jai-card border border-jai-border rounded-xl p-3 border-l-4 ${classColor(cls.name)} transition-all ${
                      past ? "opacity-35" : ""
                    } ${now ? "ring-1 ring-jai-blue/40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{cls.name}</p>
                          {now && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-jai-blue/20 text-jai-blue font-bold uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                              <span className="w-1.5 h-1.5 bg-jai-blue rounded-full animate-pulse" />
                              NOW
                            </span>
                          )}
                          {next && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70 font-semibold uppercase tracking-wider flex-shrink-0">
                              NEXT
                            </span>
                          )}
                        </div>
                        <p className="text-jai-text text-xs mt-0.5">
                          {cls.start_time.slice(0, 5)} – {cls.end_time.slice(0, 5)}
                          {cls.lead_coach && ` · ${cls.lead_coach.full_name}`}
                          {cls.class_coaches
                            ?.filter((cc) => !cc.is_lead && cc.coach)
                            .map((cc) => ` + ${cc.coach!.full_name}`)
                            .join("")}
                          {!cls.class_coaches?.length &&
                            cls.assistant_coach &&
                            ` + ${cls.assistant_coach.full_name}`}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              } else {
                const s = item.data as PtSession;
                const dt = new Date(s.scheduled_at);
                const time = dt.toLocaleTimeString("en-SG", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Singapore",
                });
                const isEditing = editingId === s.id;
                const ptPast = isPtPast(s.scheduled_at, s.duration_minutes || 60);
                const ptNow = isPtNow(s.scheduled_at, s.duration_minutes || 60);
                return (
                  <div
                    key={`pt-${s.id}`}
                    className={`bg-jai-card border border-jai-border rounded-xl p-3 border-l-4 border-l-green-400 transition-all ${
                      isEditing ? "ring-1 ring-green-500/40" : "cursor-pointer"
                    } ${ptPast && !isEditing ? "opacity-35" : ""} ${ptNow ? "ring-1 ring-green-400/40" : ""}`}
                    onClick={() => !isEditing && openEdit(s)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            PT — {s.member?.full_name || "Client"}
                          </p>
                          {ptNow && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                              NOW
                            </span>
                          )}
                        </div>
                        <p className="text-jai-text text-xs mt-0.5">
                          {time}{s.coach && ` · ${s.coach.full_name}`}
                        </p>
                      </div>
                      {!isEditing && (
                        <svg className="w-3.5 h-3.5 text-jai-text/40 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      )}
                    </div>

                    {/* Inline edit form */}
                    {isEditing && (
                      <div
                        className="mt-3 pt-3 border-t border-jai-border space-y-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-jai-text mb-1 block">Coach</label>
                            <select
                              value={editCoachId}
                              onChange={(e) => setEditCoachId(e.target.value)}
                              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
                            >
                              {coaches.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.full_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-jai-text mb-1 block">Duration</label>
                            <select
                              value={editDuration}
                              onChange={(e) => setEditDuration(Number(e.target.value))}
                              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
                            >
                              <option value={30}>30 min</option>
                              <option value={60}>60 min</option>
                              <option value={90}>90 min</option>
                              <option value={120}>120 min</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-jai-text mb-1 block">Date</label>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-jai-text mb-1 block">Time</label>
                            <input
                              type="time"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                              className="w-full bg-jai-bg border border-jai-border rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(s.id)}
                            disabled={saving}
                            className="flex-1 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-2 bg-jai-bg border border-jai-border text-sm rounded-lg hover:bg-white/5 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                        {s.status !== "completed" && s.status !== "cancelled" && s.status !== "no_show" && (
                          <button
                            onClick={() => setCompleteSession(s)}
                            className="w-full py-2 bg-green-600/10 text-green-400 border border-green-500/20 text-xs rounded-lg font-medium hover:bg-green-600/20"
                          >
                            ✅ Mark Completed + Sign
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
            })}
          </div>
        )}
      </section>

      {/* Tomorrow — collapsed by default with peek */}
      <section>
        <button
          onClick={() => setTomorrowOpen(!tomorrowOpen)}
          className="w-full flex items-center justify-between py-2 group"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider">
              Tomorrow
            </h2>
            <span className="text-xs text-jai-text/60 capitalize">{tomorrowDateLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-jai-text/60">{tmrSummary}</span>
            <svg
              className={`w-4 h-4 text-jai-text/40 transition-transform ${tomorrowOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {tomorrowOpen && (
          <div className="space-y-2 mt-2">
            {tomorrowItems.length === 0 ? (
              <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-sm">
                Nothing scheduled.
              </div>
            ) : (
              tomorrowItems.map((item) => {
                if (item.type === "class") {
                  const cls = item.data as Class;
                  return (
                    <div
                      key={`tmr-class-${cls.id}`}
                      className={`bg-jai-card border border-jai-border rounded-xl p-3 border-l-4 ${classColor(cls.name)}`}
                    >
                      <p className="font-medium text-sm">{cls.name}</p>
                      <p className="text-jai-text text-xs mt-0.5">
                        {cls.start_time.slice(0, 5)} – {cls.end_time.slice(0, 5)}
                        {cls.lead_coach && ` · ${cls.lead_coach.full_name}`}
                        {cls.class_coaches
                          ?.filter((cc) => !cc.is_lead && cc.coach)
                          .map((cc) => ` + ${cc.coach!.full_name}`)
                          .join("")}
                        {!cls.class_coaches?.length &&
                          cls.assistant_coach &&
                          ` + ${cls.assistant_coach.full_name}`}
                      </p>
                    </div>
                  );
                } else {
                  const s = item.data as PtSession;
                  const dt = new Date(s.scheduled_at);
                  const time = dt.toLocaleTimeString("en-SG", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "Asia/Singapore",
                  });
                  return (
                    <div
                      key={`tmr-pt-${s.id}`}
                      className="bg-jai-card border border-jai-border rounded-xl p-3 border-l-4 border-l-green-400"
                    >
                      <p className="font-medium text-sm">
                        PT — {s.member?.full_name || "Client"}
                      </p>
                      <p className="text-jai-text text-xs mt-0.5">
                        {time}{s.coach && ` · ${s.coach.full_name}`}
                      </p>
                    </div>
                  );
                }
              })
            )}
          </div>
        )}
      </section>
      <SessionCompleteDialog
        open={!!completeSession}
        memberName={completeSession?.member?.full_name || "Client"}
        saving={completing}
        payPerClass={!!completeSession?.member?.pt_pay_per_class}
        defaultPrice={completeSession?.member?.pt_default_price_per_class ?? null}
        onCancel={() => setCompleteSession(null)}
        onConfirm={handleComplete}
      />
    </div>
    </PullToRefresh>
  );
}
