"use client";

import { useState } from "react";
import { Class, PtSession } from "@/lib/types/database";
import { getTodayHoliday, isPublicHoliday } from "@/lib/sg-holidays";
import { PtCard } from "./pt-card";
import { NextUpStrip } from "./next-up-strip";
import { PullToRefresh } from "./pull-to-refresh";
import { TodayTrialsStrip, TrialRow } from "./today-trials-strip";

function getSgtNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
}

function isClassPast(endTime: string): boolean {
  const now = getSgtNow();
  const [h, m] = endTime.split(":").map(Number);
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

function isClassNext(startTime: string, endTime: string): boolean {
  const now = getSgtNow();
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  // Currently happening or next upcoming
  return nowMin >= startMin && nowMin < endMin;
}

function isPtPast(scheduledAt: string, durationMinutes: number): boolean {
  const now = getSgtNow();
  const end = new Date(new Date(scheduledAt).getTime() + durationMinutes * 60000);
  const endSgt = new Date(end.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return now >= endSgt;
}

function isPtNow(scheduledAt: string, durationMinutes: number): boolean {
  const now = getSgtNow();
  const start = new Date(new Date(scheduledAt).toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const end = new Date(new Date(scheduledAt).getTime() + durationMinutes * 60000);
  const endSgt = new Date(end.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return now >= start && now < endSgt;
}

function getSgtGreeting(): string {
  const hour = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" })).getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
}

/** Determine colour category for a class name */
function classColor(name: string): { border: string; bg: string; text: string; label: string } {
  const n = name.toLowerCase();
  if (n.includes("kid")) return { border: "border-l-orange-400", bg: "bg-orange-400/10", text: "text-orange-400", label: "Kids" };
  if (n.includes("teen")) return { border: "border-l-purple-400", bg: "bg-purple-400/10", text: "text-purple-400", label: "Teens" };
  return { border: "border-l-jai-blue", bg: "bg-jai-blue/10", text: "text-jai-blue", label: "Class" };
}


export function CoachDashboard({
  todayClasses,
  todayPtSessions,
  tomorrowClasses,
  tomorrowPtSessions,
  weekClasses,
  weekPtCount,
  weekPtHours,
  weekPtStats,
  nextWeekPtSessions,
  coachName,
  today,
  todayTrials = [],
}: {
  todayClasses: Class[];
  todayPtSessions: PtSession[];
  tomorrowClasses: Class[];
  tomorrowPtSessions: PtSession[];
  weekClasses: Class[];
  weekPtCount: number;
  weekPtHours: number;
  weekPtStats: { scheduled: number; completed: number; cancelled: number; noShow: number };
  nextWeekPtSessions: PtSession[];
  coachName: string;
  today: string;
  todayTrials?: TrialRow[];
}) {
  const todayHoliday = getTodayHoliday();

  const todayClassHours = todayHoliday ? 0 : todayClasses.reduce(
    (sum, c) => sum + calcHours(c.start_time, c.end_time),
    0
  );
  const todayPtHours = todayHoliday ? 0 : todayPtSessions.reduce(
    (sum, s) => sum + (s.duration_minutes || 60) / 60,
    0
  );
  const todayHours = todayClassHours + todayPtHours;

  const weekClassHours = weekClasses.reduce(
    (sum, c) => sum + calcHours(c.start_time, c.end_time),
    0
  );
  const weekTotalHours = weekClassHours + weekPtHours;

  // Build today's timeline
  type TimelineItem = { type: "class"; sortKey: string; data: Class } | { type: "pt"; sortKey: string; data: PtSession };
  const todayItems: TimelineItem[] = [];
  todayClasses.forEach((cls) => todayItems.push({ type: "class", sortKey: cls.start_time, data: cls }));
  todayPtSessions.forEach((s) => {
    const dt = new Date(s.scheduled_at);
    const sgt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    const hh = sgt.getHours().toString().padStart(2, "0");
    const mm = sgt.getMinutes().toString().padStart(2, "0");
    todayItems.push({ type: "pt", sortKey: `${hh}:${mm}`, data: s });
  });
  todayItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Find the "next" item — first non-past item
  let nextIdx = -1;
  for (let i = 0; i < todayItems.length; i++) {
    const item = todayItems[i];
    if (item.type === "class") {
      const cls = item.data as Class;
      if (!isClassPast(cls.end_time)) {
        nextIdx = i;
        break;
      }
    } else {
      const s = item.data as PtSession;
      if (!isPtPast(s.scheduled_at, s.duration_minutes || 60)) {
        nextIdx = i;
        break;
      }
    }
  }

  return (
    <PullToRefresh>
    <div className="space-y-5">
      {/* Compact header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">
            {getSgtGreeting()}, {coachName.split(" ")[0]}
          </h1>
          <p className="text-jai-text text-xs capitalize">
            {today} &middot;{" "}
            {new Date().toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              timeZone: "Asia/Singapore",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Week hours badge */}
          <div className="text-right">
            <p className="text-xs text-jai-text">This week</p>
            <p className="text-sm font-bold">{weekTotalHours.toFixed(1)}h</p>
          </div>
        </div>
      </div>

      {/* "Next up" glance strip */}
      <NextUpStrip items={todayItems} disabled={!!todayHoliday} />

      {/* Today's trials peek (read-only for coaches) */}
      <TodayTrialsStrip trials={todayTrials} actionable={false} />

      {/* Quick stats — single horizontal row */}
      <div className="flex gap-2">
        <div className="flex-1 bg-jai-card border border-jai-border rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-jai-blue">{todayClasses.length}</p>
          <p className="text-[10px] text-jai-text">Classes</p>
        </div>
        <div className="flex-1 bg-jai-card border border-jai-border rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-green-400">{todayPtSessions.length}</p>
          <p className="text-[10px] text-jai-text">PT</p>
        </div>
        <div className="flex-1 bg-jai-card border border-jai-border rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold">{todayHours.toFixed(1)}h</p>
          <p className="text-[10px] text-jai-text">Today</p>
        </div>
        <div className="flex-1 bg-jai-card border border-jai-border rounded-xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-green-400">{weekPtCount}</p>
          <p className="text-[10px] text-jai-text">Week PT</p>
        </div>
      </div>

      {/* Today's Schedule — HERO */}
      <section>
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider mb-3">Today</h2>
        {todayHoliday ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="font-medium text-red-400">Gym Closed</p>
            <p className="text-red-400/70 text-sm">{todayHoliday.name}</p>
          </div>
        ) : todayItems.length === 0 ? (
          <div className="bg-jai-card border border-jai-border rounded-xl p-8 text-center space-y-1">
            <p className="text-2xl">🏖️</p>
            <p className="text-jai-text text-sm font-medium">Rest day</p>
            <p className="text-jai-text/60 text-xs">No sessions on your plate today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayItems.map((item, idx) => {
              const isNext = idx === nextIdx;

              if (item.type === "class") {
                const cls = item.data as Class;
                const past = isClassPast(cls.end_time);
                const current = isClassNext(cls.start_time, cls.end_time);
                const color = classColor(cls.name);
                return (
                  <div
                    key={`class-${cls.id}`}
                    className={`bg-jai-card border border-jai-border rounded-xl p-4 border-l-4 ${color.border} transition-all ${
                      past ? "opacity-35" : current ? "ring-1 ring-jai-blue/30" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{cls.name}</p>
                          {isNext && !current && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-jai-blue/20 text-jai-blue uppercase tracking-wider">
                              Next
                            </span>
                          )}
                          {current && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 uppercase tracking-wider animate-pulse">
                              Now
                            </span>
                          )}
                        </div>
                        <p className="text-jai-text text-sm mt-0.5">
                          {cls.start_time.slice(0, 5)} – {cls.end_time.slice(0, 5)}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full ${color.bg} ${color.text} font-medium`}>
                        {color.label}
                      </span>
                    </div>
                  </div>
                );
              } else {
                const s = item.data as PtSession;
                const ptPast = isPtPast(s.scheduled_at, s.duration_minutes || 60);
                const ptNow = isPtNow(s.scheduled_at, s.duration_minutes || 60);
                return (
                  <div key={`pt-${s.id}`} className="relative">
                    {(isNext && !ptNow) && (
                      <div className="absolute -top-1 left-4 z-10">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-jai-blue/20 text-jai-blue uppercase tracking-wider">
                          Next
                        </span>
                      </div>
                    )}
                    {ptNow && (
                      <div className="absolute -top-1 left-4 z-10">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 uppercase tracking-wider animate-pulse">
                          Now
                        </span>
                      </div>
                    )}
                    <PtCard s={s} isPast={ptPast} />
                  </div>
                );
              }
            })}
          </div>
        )}
      </section>

      {/* Tomorrow — collapsible peek */}
      <TomorrowSection
        classes={tomorrowClasses}
        ptSessions={tomorrowPtSessions}
      />

      {/* Next Week PT */}
      {nextWeekPtSessions.length > 0 && (
        <NextWeekPtSection sessions={nextWeekPtSessions} />
      )}

      {/* Week breakdown — expandable */}
      <WeekBreakdown
        weekClasses={weekClasses.length}
        weekPtStats={weekPtStats}
        weekTotalHours={weekTotalHours}
      />
    </div>
    </PullToRefresh>
  );
}

/** Tomorrow section — collapsed by default, shows peek summary */
function TomorrowSection({ classes, ptSessions }: { classes: Class[]; ptSessions: PtSession[] }) {
  const [expanded, setExpanded] = useState(false);

  const tomorrowDateObj = new Date(Date.now() + 86400000);
  const tomorrowStr = tomorrowDateObj.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const tomorrowHoliday = isPublicHoliday(tomorrowStr);
  const tomorrowLabel = tomorrowDateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  });

  if (tomorrowHoliday) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider mb-3">Tomorrow</h2>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <p className="font-medium text-red-400">Gym Closed — {tomorrowHoliday.name}</p>
        </div>
      </section>
    );
  }

  // Build sorted items for tomorrow
  type TItem = { type: "class"; sortKey: string; data: Class } | { type: "pt"; sortKey: string; data: PtSession };
  const tItems: TItem[] = [];
  classes.forEach((cls) => tItems.push({ type: "class", sortKey: cls.start_time, data: cls }));
  ptSessions.forEach((s) => {
    const dt = new Date(s.scheduled_at);
    const sgt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
    const hh = sgt.getHours().toString().padStart(2, "0");
    const mm = sgt.getMinutes().toString().padStart(2, "0");
    tItems.push({ type: "pt", sortKey: `${hh}:${mm}`, data: s });
  });
  tItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const totalSessions = tItems.length;
  const firstTime = tItems.length > 0 ? tItems[0].sortKey.slice(0, 5) : null;

  if (totalSessions === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider mb-3">Tomorrow</h2>
        <div className="bg-jai-card border border-jai-border rounded-xl p-6 text-center space-y-1">
          <p className="text-xl">🌤️</p>
          <p className="text-jai-text text-sm font-medium">Nothing booked for tomorrow</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider">Tomorrow</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-jai-text">
            {totalSessions} session{totalSessions !== 1 ? "s" : ""}{firstTime ? ` from ${firstTime}` : ""}
          </span>
          <svg
            className={`w-4 h-4 text-jai-text transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2">
          <p className="text-xs text-jai-text capitalize mb-1">{tomorrowLabel}</p>
          {tItems.map((item) => {
            if (item.type === "class") {
              const cls = item.data as Class;
              const color = classColor(cls.name);
              return (
                <div key={`tmr-class-${cls.id}`} className={`bg-jai-card border border-jai-border rounded-xl p-4 border-l-4 ${color.border}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{cls.name}</p>
                      <p className="text-jai-text text-sm">
                        {cls.start_time.slice(0, 5)} – {cls.end_time.slice(0, 5)}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full ${color.bg} ${color.text} font-medium`}>
                      {color.label}
                    </span>
                  </div>
                </div>
              );
            } else {
              const s = item.data as PtSession;
              return <PtCard key={`tmr-pt-${s.id}`} s={s} />;
            }
          })}
        </div>
      )}
    </section>
  );
}

function NextWeekPtSection({ sessions }: { sessions: PtSession[] }) {
  const [expanded, setExpanded] = useState(false);
  const scheduled = sessions.filter((s) => s.status === "scheduled" || s.status === "confirmed");
  const resolved = sessions.filter((s) => s.status === "completed" || s.status === "cancelled" || s.status === "no_show");

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider">
          Next Week PT
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-jai-text">{scheduled.length} scheduled</span>
          <svg
            className={`w-4 h-4 text-jai-text transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2">
          {scheduled.map((s) => (
            <PtCard key={s.id} s={s} showDate />
          ))}
          {resolved.map((s) => (
            <PtCard key={s.id} s={s} showDate />
          ))}
        </div>
      )}
    </section>
  );
}

/** Expandable week breakdown — replaces the old "This Week" stats card */
function WeekBreakdown({
  weekClasses,
  weekPtStats,
  weekTotalHours,
}: {
  weekClasses: number;
  weekPtStats: { scheduled: number; completed: number; cancelled: number; noShow: number };
  weekTotalHours: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wider">Week Summary</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-jai-text">{weekTotalHours.toFixed(1)}h total</span>
          <svg
            className={`w-4 h-4 text-jai-text transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-jai-text">Classes</span>
            <span className="text-sm font-semibold text-jai-blue">{weekClasses}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-jai-text">PT — Scheduled</span>
            <span className="text-sm font-semibold text-jai-blue">{weekPtStats.scheduled}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-jai-text">PT — Completed</span>
            <span className="text-sm font-semibold text-green-400">{weekPtStats.completed}</span>
          </div>
          {weekPtStats.cancelled > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-jai-text">PT — Cancelled</span>
              <span className="text-sm font-semibold text-red-400">{weekPtStats.cancelled}</span>
            </div>
          )}
          {weekPtStats.noShow > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-jai-text">PT — No Show</span>
              <span className="text-sm font-semibold text-amber-400">{weekPtStats.noShow}</span>
            </div>
          )}
          <div className="border-t border-jai-border pt-2 flex items-center justify-between">
            <span className="text-sm font-medium">Total Hours</span>
            <span className="text-sm font-bold">{weekTotalHours.toFixed(1)}h</span>
          </div>
        </div>
      )}
    </section>
  );
}
