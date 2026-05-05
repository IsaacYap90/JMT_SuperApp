"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Class, PtSession } from "@/lib/types/database";
import { isPublicHoliday } from "@/lib/sg-holidays";
import { PtCard } from "./pt-card";

function CalendarSubscribeButton({ coachId }: { coachId: string }) {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const baseUrl = `${window.location.origin}/api/calendar?id=${coachId}`;
  const calUrl = baseUrl.replace(/^https?:\/\//, "webcal://");

  function handleCopy() {
    navigator.clipboard.writeText(calUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-jai-card border border-jai-border rounded-lg text-jai-text hover:text-white hover:border-jai-blue/40 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Sync
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowModal(false)}>
          <div className="bg-jai-card border border-jai-border rounded-2xl p-5 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">Sync to Phone Calendar</h3>
            <div className="space-y-3 text-sm text-jai-text">
              <div>
                <p className="font-medium text-white mb-1">iPhone:</p>
                <p>Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar → paste the link below</p>
              </div>
              <div>
                <p className="font-medium text-white mb-1">Android / Google Calendar:</p>
                <p>Open Google Calendar → Settings → Add calendar → From URL → paste the link below</p>
              </div>
              <div>
                <p className="font-medium text-white mb-1">Samsung Calendar:</p>
                <p>Open Google Calendar on your browser → Settings ⚙️ → Add calendar → From URL → paste the link below → Subscribe. It will auto-sync to your Samsung Calendar app.</p>
              </div>
            </div>
            <div className="bg-jai-bg border border-jai-border rounded-lg p-3 text-xs break-all text-jai-text font-mono">
              {calUrl}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 py-2.5 bg-jai-blue text-white text-sm font-medium rounded-lg hover:bg-jai-blue/90 transition-colors"
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 bg-jai-bg border border-jai-border text-sm rounded-lg hover:bg-white/5 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoTodaySgt(): string {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function parseIsoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date();
  dt.setFullYear(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function getDates(anchorDate: string): { date: Date; dayName: string; label: string; dateNum: number; isToday: boolean }[] {
  const todayIso = isoTodaySgt();
  const anchor = parseIsoToLocalDate(anchorDate);

  const dates: { date: Date; dayName: string; label: string; dateNum: number; isToday: boolean }[] = [];
  for (let i = -14; i <= 21; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    const dow = d.getDay();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dates.push({
      date: d,
      dayName: DAY_NAMES[dow],
      label: DAY_LABELS[dow],
      dateNum: d.getDate(),
      isToday: iso === todayIso,
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
  phone?: string | null;
  isPast: boolean;
  ptSession?: PtSession;
};

type FilterType = "all" | "pt";

export function CoachSchedule({
  classes,
  ptSessions,
  showFilter = false,
  coachId,
  anchorDate,
}: {
  classes: Class[];
  ptSessions: PtSession[];
  showFilter?: boolean;
  coachId?: string;
  anchorDate: string;
}) {
  const router = useRouter();
  const dates = getDates(anchorDate);
  const anchorIdx = dates.findIndex((d) => {
    const iso = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, "0")}-${String(d.date.getDate()).padStart(2, "0")}`;
    return iso === anchorDate;
  });
  const [selectedIdx, setSelectedIdx] = useState(anchorIdx >= 0 ? anchorIdx : 14);
  const [filter, setFilter] = useState<FilterType>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const todayIso = isoTodaySgt();

  function jumpToDate(iso: string) {
    if (iso === anchorDate) return;
    router.push(`/schedule?date=${iso}`);
  }

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
        phone: s.member?.phone,
        isPast: isTimePast(end),
        ptSession: s,
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Schedule</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => e.target.value && jumpToDate(e.target.value)}
            className="px-3 py-1.5 bg-jai-card border border-jai-border text-jai-text text-xs rounded-lg hover:text-white hover:border-jai-blue/40 transition-colors"
            aria-label="Jump to date"
          />
          {anchorDate !== todayIso && (
            <button
              onClick={() => jumpToDate(todayIso)}
              className="px-3 py-1.5 bg-jai-card border border-jai-border text-jai-text text-xs rounded-lg hover:text-white hover:border-jai-blue/40 transition-colors"
            >
              Today
            </button>
          )}
          {coachId && <CalendarSubscribeButton coachId={coachId} />}
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
          {items.map((item) => {
            if (item.type === "pt" && item.ptSession) {
              return <PtCard key={item.id} s={item.ptSession} isPast={item.isPast} />;
            }
            return (
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
                  <span className="text-[10px] px-2.5 py-1 rounded-full border ml-3 bg-jai-blue/10 text-jai-blue border-jai-blue/20">
                    Class
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
