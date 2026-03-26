"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Class, PtSession, User } from "@/lib/types/database";
import { ClassModal } from "./class-modal";
import { createClient } from "@/lib/supabase/client";
import { isPublicHoliday } from "@/lib/sg-holidays";
import { updatePtSession } from "@/app/actions/pt";

const CLASS_SELECT =
  "*, lead_coach:users!classes_lead_coach_id_fkey(*), assistant_coach:users!classes_assistant_coach_id_fkey(*), class_coaches(*, coach:users(*))";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDates() {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  today.setHours(0, 0, 0, 0);

  const dates: { date: Date; dayName: string; label: string; dateNum: number; isToday: boolean }[] = [];
  for (let i = -7; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay();
    dates.push({
      date: d,
      dayName: DAY_NAMES[dow],
      label: DAY_LABELS[dow],
      dateNum: d.getDate(),
      isToday: i === 0,
    });
  }
  return dates;
}

export function SchedulePageClient({
  classes: initialClasses,
  coaches,
  ptSessions: initialPtSessions,
  isAdmin,
}: {
  classes: Class[];
  coaches: User[];
  ptSessions: PtSession[];
  isAdmin: boolean;
}) {
  const dates = getDates();
  const todayIdx = dates.findIndex((d) => d.isToday);
  const [selectedIdx, setSelectedIdx] = useState(todayIdx >= 0 ? todayIdx : 0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [classes, setClasses] = useState<Class[]>(initialClasses);
  const [ptSessions, setPtSessions] = useState<PtSession[]>(initialPtSessions);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);

  // PT edit state
  const [editingPtId, setEditingPtId] = useState<string | null>(null);
  const [editCoachId, setEditCoachId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState(60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      const btn = scrollRef.current.children[selectedIdx] as HTMLElement;
      if (btn) {
        btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [selectedIdx]);

  const refetchClasses = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("classes")
      .select(CLASS_SELECT)
      .eq("is_active", true)
      .order("start_time");
    if (data) setClasses(data as unknown as Class[]);
  }, []);

  const selected = dates[selectedIdx];
  const dayOfWeek = selected.dayName;
  const selectedDateStr = `${selected.date.getFullYear()}-${String(selected.date.getMonth() + 1).padStart(2, "0")}-${String(selected.date.getDate()).padStart(2, "0")}`;

  // Classes for selected day
  const dayClasses = classes
    .filter((c) => c.day_of_week === dayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // PT sessions for selected date
  const dayPtSessions = ptSessions.filter((s) => {
    const sessDate = new Date(s.scheduled_at).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    return sessDate === selectedDateStr;
  });

  function openPtEdit(s: PtSession) {
    const dt = new Date(s.scheduled_at);
    const dateStr = dt.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const timeStr = dt.toLocaleTimeString("en-SG", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore",
    });
    setEditingPtId(s.id);
    setEditCoachId(s.coach_id);
    setEditDate(dateStr);
    setEditTime(timeStr);
    setEditDuration(s.duration_minutes || 60);
  }

  async function handlePtSave(sessionId: string) {
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
      setEditingPtId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  // Check if selected date is past or today
  const sgtNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const sgtTodayStr = `${sgtNow.getFullYear()}-${String(sgtNow.getMonth() + 1).padStart(2, "0")}-${String(sgtNow.getDate()).padStart(2, "0")}`;
  const isSelectedPast = selectedDateStr < sgtTodayStr;
  const isSelectedToday = selectedDateStr === sgtTodayStr;

  function isTimePast(endTime: string): boolean {
    if (isSelectedPast) return true;
    if (!isSelectedToday) return false;
    const [h, m] = endTime.split(":").map(Number);
    return sgtNow.getHours() > h || (sgtNow.getHours() === h && sgtNow.getMinutes() >= m);
  }

  // Combine into sorted items
  type ScheduleItem =
    | { type: "class"; data: Class; sortTime: string; isPast: boolean }
    | { type: "pt"; data: PtSession; sortTime: string; isPast: boolean };

  const items: ScheduleItem[] = [
    ...dayClasses.map((c) => ({
      type: "class" as const,
      data: c,
      sortTime: c.start_time,
      isPast: isTimePast(c.end_time),
    })),
    ...dayPtSessions.map((s) => {
      const dt = new Date(s.scheduled_at);
      const time = dt.toLocaleTimeString("en-SG", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore",
      });
      const endDt = new Date(dt.getTime() + (s.duration_minutes || 60) * 60000);
      const endTime = endDt.toLocaleTimeString("en-SG", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore",
      });
      return { type: "pt" as const, data: s, sortTime: time, isPast: isTimePast(endTime) };
    }),
  ].sort((a, b) => a.sortTime.localeCompare(b.sortTime));

  const holiday = isPublicHoliday(selectedDateStr);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Schedule</h1>
        {isAdmin && (
          <button
            onClick={() => setShowAddClass(true)}
            className="px-4 py-2 bg-jai-blue text-white text-sm rounded-lg hover:bg-jai-blue/90 transition-colors"
          >
            + Add Class
          </button>
        )}
      </div>

      {/* Date scroller */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-1 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {dates.map((d, i) => {
            const isoDate = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, "0")}-${String(d.date.getDate()).padStart(2, "0")}`;
            const isPH = !!isPublicHoliday(isoDate);
            return (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl transition-colors ${
                  i === selectedIdx
                    ? isPH ? "bg-red-500 text-white" : "bg-jai-blue text-white"
                    : isPH
                    ? "bg-red-500/10 text-red-400"
                    : d.isToday
                    ? "bg-jai-blue/10 text-jai-blue"
                    : "text-jai-text hover:bg-white/5"
                }`}
              >
                <span className="text-[10px] font-medium uppercase">{d.label}</span>
                <span className="text-lg font-bold">{d.dateNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day label */}
      <p className="text-sm text-jai-text capitalize">
        {selected.dayName},{" "}
        {selected.date.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          timeZone: "Asia/Singapore",
        })}
      </p>

      {/* Schedule content */}
      {holiday ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="font-medium text-red-400">Gym Closed</p>
          <p className="text-red-400/70 text-sm">{holiday.name}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-jai-card border border-jai-border rounded-xl p-6 text-center">
          <p className="text-jai-text">No classes or PT sessions on this day.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            if (item.type === "class") {
              const cls = item.data;
              const coachNames = [
                cls.lead_coach?.full_name,
                ...(cls.class_coaches?.filter((cc) => !cc.is_lead && cc.coach).map((cc) => cc.coach!.full_name) || []),
              ].filter(Boolean).join(", ");
              return (
                <div
                  key={cls.id}
                  className={`bg-jai-card border border-jai-border rounded-xl p-4 hover:border-jai-blue/40 transition-colors cursor-pointer ${item.isPast ? "opacity-40" : ""}`}
                  onClick={() => isAdmin && setEditingClass(cls)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{cls.name}</p>
                      <p className="text-jai-text text-sm">
                        {cls.start_time.slice(0, 5)} - {cls.end_time.slice(0, 5)}
                      </p>
                      {coachNames && (
                        <p className="text-jai-text/60 text-xs mt-0.5">{coachNames}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <span className="text-[10px] px-2.5 py-1 rounded-full border bg-jai-blue/10 text-jai-blue border-jai-blue/20">
                        Class
                      </span>
                      {isAdmin && (
                        <svg className="w-4 h-4 text-jai-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            // PT session card
            const s = item.data;
            const dt = new Date(s.scheduled_at);
            const time = dt.toLocaleTimeString("en-SG", {
              hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore",
            });
            const endDt = new Date(dt.getTime() + (s.duration_minutes || 60) * 60000);
            const endTime = endDt.toLocaleTimeString("en-SG", {
              hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore",
            });
            const isEditing = editingPtId === s.id;

            return (
              <div
                key={s.id}
                className={`bg-jai-card border rounded-xl p-4 transition-colors ${
                  isEditing ? "border-green-500/40" : "border-jai-border hover:border-green-500/30 cursor-pointer"
                } ${item.isPast && !isEditing ? "opacity-40" : ""}`}
                onClick={() => !isEditing && isAdmin && openPtEdit(s)}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      PT — {s.member?.full_name || "Client"}
                    </p>
                    <p className="text-jai-text text-sm">
                      {time} - {endTime}
                    </p>
                    <p className="text-jai-text/60 text-xs mt-0.5">
                      {s.coach ? `${s.coach.full_name} · ` : ""}{s.duration_minutes || 60}min
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="text-[10px] px-2.5 py-1 rounded-full border bg-green-500/10 text-green-400 border-green-500/20">
                      PT
                    </span>
                    {isAdmin && !isEditing && (
                      <svg className="w-4 h-4 text-jai-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Inline PT edit form */}
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
                            <option key={c.id} value={c.id}>{c.full_name}</option>
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
                        onClick={() => handlePtSave(s.id)}
                        disabled={saving}
                        className="flex-1 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingPtId(null)}
                        className="px-4 py-2 bg-jai-bg border border-jai-border text-sm rounded-lg hover:bg-white/5 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ClassModal for editing/adding */}
      {(editingClass || showAddClass) && (
        <ClassModal
          cls={editingClass}
          coaches={coaches}
          onClose={() => {
            setEditingClass(null);
            setShowAddClass(false);
          }}
          onSaved={async () => {
            setEditingClass(null);
            setShowAddClass(false);
            await refetchClasses();
          }}
        />
      )}
    </div>
  );
}
