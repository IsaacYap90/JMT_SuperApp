"use client";

import { useState, useRef, useEffect } from "react";
import { Class, PtSession } from "@/lib/types/database";
import { isPublicHoliday } from "@/lib/sg-holidays";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDates(): { date: Date; dayName: string; label: string; dateNum: number; isToday: boolean }[] {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  today.setHours(0, 0, 0, 0);

  const dates: { date: Date; dayName: string; label: string; dateNum: number; isToday: boolean }[] = [];
  // 7 days back + today + 14 days forward = 22 days total
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

type ScheduleItem = {
  id: string;
  type: "class" | "pt";
  name: string;
  startTime: string;
  endTime: string;
  subtitle?: string;
  isPast: boolean;
};

type FilterType = "all" | "pt";

export function CoachSchedule({
  classes,
  ptSessions,
  showFilter = false,
}: {
  classes: Class[];
  ptSessions: PtSession[];
  showFilter?: boolean;
}) {
  const dates = getDates();
  const todayIdx = dates.findIndex((d) => d.isToday);
  const [selectedIdx, setSelectedIdx] = useState(todayIdx >= 0 ? todayIdx : 0);
  const [filter, setFilter] = useState<FilterType>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const btn = scrollRef.current.children[selectedIdx] as HTMLElement;
      if (btn) {
        btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [selectedIdx]);

  const selected = dates[selectedIdx];
  const dayOfWeek = selected.dayName;
  const selectedDateStr = `${selected.date.getFullYear()}-${String(selected.date.getMonth() + 1).padStart(2, "0")}-${String(selected.date.getDate()).padStart(2, "0")}`;

  // Get classes for selected day
  const dayClasses = filter === "pt"
    ? []
    : classes
        .filter((c) => c.day_of_week === dayOfWeek)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Get PT sessions for selected date
  const dayPtSessions = ptSessions.filter((s) => {
    const sessDate = new Date(s.scheduled_at).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    return sessDate === selectedDateStr;
  });

  // Combine into schedule items
  // Check if selected date is in the past or today
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

  const items: ScheduleItem[] = [
    ...dayClasses.map((c) => ({
      id: c.id,
      type: "class" as const,
      name: c.name,
      startTime: c.start_time.slice(0, 5),
      endTime: c.end_time.slice(0, 5),
      subtitle: [c.lead_coach?.full_name, ...(c.class_coaches?.filter(cc => !cc.is_lead && cc.coach).map(cc => cc.coach!.full_name) || [])].filter(Boolean).join(", "),
      isPast: isTimePast(c.end_time),
    })),
    ...dayPtSessions.map((s) => {
      const dt = new Date(s.scheduled_at);
      const start = dt.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
      const endDt = new Date(dt.getTime() + (s.duration_minutes || 60) * 60000);
      const end = endDt.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
      return {
        id: s.id,
        type: "pt" as const,
        name: `PT — ${s.member?.full_name || "Client"}`,
        startTime: start,
        endTime: end,
        subtitle: s.coach ? `Coach: ${s.coach.full_name} · ${s.duration_minutes || 60}min` : `${s.duration_minutes || 60}min`,
        isPast: isTimePast(end),
      };
    }),
  ].sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Compute this week's totals (Mon–Sun)
  const todayDate = dates.find((d) => d.isToday)?.date || new Date();
  const todayDay = todayDate.getDay();
  const monOffset = todayDay === 0 ? -6 : 1 - todayDay;
  const weekMonday = new Date(todayDate);
  weekMonday.setDate(todayDate.getDate() + monOffset);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 7);
  const weekMondayStr = `${weekMonday.getFullYear()}-${String(weekMonday.getMonth() + 1).padStart(2, "0")}-${String(weekMonday.getDate()).padStart(2, "0")}`;
  const weekSundayStr = `${weekSunday.getFullYear()}-${String(weekSunday.getMonth() + 1).padStart(2, "0")}-${String(weekSunday.getDate()).padStart(2, "0")}`;

  const weekClassCount = classes.length; // all recurring classes assigned to this coach
  const weekPtCount = ptSessions.filter((s) => {
    const d = new Date(s.scheduled_at).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    return d >= weekMondayStr && d < weekSundayStr;
  }).length;

  const holiday = isPublicHoliday(selectedDateStr);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Schedule</h1>
        {showFilter && (
          <div className="flex bg-jai-card border border-jai-border rounded-lg overflow-hidden">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "all" ? "bg-jai-blue text-white" : "text-jai-text hover:text-white"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("pt")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "pt" ? "bg-green-500 text-white" : "text-jai-text hover:text-white"
              }`}
            >
              PT Only
            </button>
          </div>
        )}
      </div>

      {/* Week summary */}
      <div className="flex gap-3">
        <div className="flex-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-jai-text">Classes this week</span>
          <span className="text-sm font-semibold text-jai-blue">{weekClassCount}</span>
        </div>
        <div className="flex-1 bg-jai-card border border-jai-border rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-jai-text">PT this week</span>
          <span className="text-sm font-semibold text-green-400">{weekPtCount}</span>
        </div>
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

      {/* Public Holiday check */}
      {holiday ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="font-medium text-red-400">Gym Closed</p>
          <p className="text-red-400/70 text-sm">{holiday.name}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-jai-card border border-jai-border rounded-xl p-6 text-center">
          <p className="text-jai-text">
            {filter === "pt" ? "No PT sessions on this day." : "No classes or PT sessions on this day."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-jai-card border border-jai-border rounded-xl p-4 ${item.isPast ? "opacity-40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-jai-text text-sm">
                    {item.startTime} - {item.endTime}
                  </p>
                  {item.subtitle && (
                    <p className="text-jai-text/60 text-xs mt-0.5">{item.subtitle}</p>
                  )}
                </div>
                <span
                  className={`text-[10px] px-2.5 py-1 rounded-full border ml-3 ${
                    item.type === "class"
                      ? "bg-jai-blue/10 text-jai-blue border-jai-blue/20"
                      : "bg-green-500/10 text-green-400 border-green-500/20"
                  }`}
                >
                  {item.type === "class" ? "Class" : "PT"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
