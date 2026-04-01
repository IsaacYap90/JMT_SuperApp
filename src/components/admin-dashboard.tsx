"use client";

import { useState } from "react";
import Link from "next/link";
import { Class, PtSession, User } from "@/lib/types/database";
import { MetricCard } from "./metric-card";
import { getTodayHoliday } from "@/lib/sg-holidays";
import { updatePtSession } from "@/app/actions/pt";

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

function getSgtGreeting(): string {
  const hour = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" })).getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function AdminDashboard({
  todayClasses,
  todayPtSessions,
  activePtPackages,
  pendingLeaves,
  today,
  userName,
  coaches,
}: {
  todayClasses: Class[];
  todayPtSessions: PtSession[];
  activePtPackages: number;
  pendingLeaves: number;
  today: string;
  userName: string;
  coaches: User[];
}) {
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

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">{getSgtGreeting()}, {userName}</h1>
        <p className="text-jai-text text-sm mt-1 capitalize">
          {today} &middot;{" "}
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Singapore",
          })}
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <MetricCard title="Today's Classes" value={classes.length} href="/schedule" />
        <MetricCard title="Today's PT" value={ptSessions.length} href="/pt" />
        <MetricCard title="Active PT" value={activePtPackages} href="/pt" />
        <MetricCard title="Pending Leave" value={pendingLeaves} href="/leave" highlight={pendingLeaves > 0} />
      </div>

      {/* Today's Schedule */}
      <section>
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
          Today&apos;s Schedule
        </h2>
        {todayHoliday ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 md:p-6 text-center">
            <p className="font-medium text-red-400">Gym Closed</p>
            <p className="text-red-400/70 text-sm">{todayHoliday.name}</p>
          </div>
        ) : classes.length === 0 && ptSessions.length === 0 ? (
          <div className="bg-jai-card border border-jai-border rounded-xl p-4 md:p-6 text-jai-text text-sm">
            No classes or PT sessions today.
          </div>
        ) : (
          <div className="space-y-2">
            {timelineItems.map((item) => {
              if (item.type === "class") {
                const cls = item.data as Class;
                const past = isClassPast(cls.end_time);
                return (
                  <Link
                    key={`class-${cls.id}`}
                    href="/schedule"
                    className={`block bg-jai-card border border-jai-border rounded-xl p-3 md:p-4 hover:border-jai-blue/40 transition-colors ${past ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm md:text-base">{cls.name}</p>
                        <p className="text-jai-text text-sm">
                          {cls.start_time.slice(0, 5)} - {cls.end_time.slice(0, 5)}
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
                      <div className="flex items-center gap-2 ml-3">
                        <span className="text-[10px] px-2 py-1 rounded-full bg-jai-blue/10 text-jai-blue border border-jai-blue/20">
                          Class
                        </span>
                        <svg className="w-4 h-4 text-jai-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
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
                return (
                  <div
                    key={`pt-${s.id}`}
                    className={`bg-jai-card border rounded-xl p-3 md:p-4 transition-colors ${
                      isEditing ? "border-green-500/40" : "border-jai-border hover:border-green-500/30 cursor-pointer"
                    } ${ptPast && !isEditing ? "opacity-40" : ""}`}
                    onClick={() => !isEditing && openEdit(s)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm md:text-base">
                          PT — {s.member?.full_name || "Client"}
                        </p>
                        <p className="text-jai-text text-sm">
                          {time} · {s.duration_minutes || 60}min
                          {s.coach && ` · ${s.coach.full_name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                          PT
                        </span>
                        {!isEditing && (
                          <svg className="w-4 h-4 text-jai-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        )}
                      </div>
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
                      </div>
                    )}
                  </div>
                );
              }
            })}
          </div>
        )}
      </section>
    </div>
  );
}
