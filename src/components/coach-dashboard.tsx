"use client";

import { Class, PtSession } from "@/lib/types/database";
import { getTodayHoliday, isPublicHoliday } from "@/lib/sg-holidays";
import { NotificationBell } from "./notification-bell";
import { PtCard } from "./pt-card";

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

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            {getSgtGreeting()}, {coachName}
          </h1>
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
        <div className="lg:hidden">
          <NotificationBell />
        </div>
      </div>

      {/* Metrics — 2 summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-jai-card border border-jai-border rounded-xl p-4">
          <p className="text-jai-text text-xs mb-2">Today</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-jai-text">Classes</span>
              <span className="text-sm font-semibold text-jai-blue">{todayClasses.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-jai-text">PT</span>
              <span className="text-sm font-semibold text-green-400">{todayPtSessions.length}</span>
            </div>
            <div className="border-t border-jai-border pt-1.5 flex items-center justify-between">
              <span className="text-sm text-jai-text">Hours</span>
              <span className="text-sm font-bold">{todayHours.toFixed(1)}h</span>
            </div>
          </div>
        </div>
        <div className="bg-jai-card border border-jai-border rounded-xl p-4">
          <p className="text-jai-text text-xs mb-2">This Week</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-jai-text">Classes</span>
              <span className="text-sm font-semibold text-jai-blue">{weekClasses.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-jai-text">PT Total</span>
              <span className="text-sm font-semibold text-green-400">{weekPtCount}</span>
            </div>
            <div className="border-t border-jai-border pt-1.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-jai-text">Scheduled</span>
                <span className="text-xs font-medium text-jai-blue">{weekPtStats.scheduled}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-jai-text">Completed</span>
                <span className="text-xs font-medium text-green-400">{weekPtStats.completed}</span>
              </div>
              {weekPtStats.cancelled > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-jai-text">Cancelled</span>
                  <span className="text-xs font-medium text-red-400">{weekPtStats.cancelled}</span>
                </div>
              )}
              {weekPtStats.noShow > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-jai-text">No Show</span>
                  <span className="text-xs font-medium text-amber-400">{weekPtStats.noShow}</span>
                </div>
              )}
            </div>
            <div className="border-t border-jai-border pt-1.5 flex items-center justify-between">
              <span className="text-sm text-jai-text">Hours</span>
              <span className="text-sm font-bold">{weekTotalHours.toFixed(1)}h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Schedule */}
      <section>
        <h2 className="text-base font-semibold mb-3">Today&apos;s Schedule</h2>
        {todayHoliday ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="font-medium text-red-400">Gym Closed</p>
            <p className="text-red-400/70 text-sm">{todayHoliday.name}</p>
          </div>
        ) : todayClasses.length === 0 && todayPtSessions.length === 0 ? (
          <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-sm">
            No classes or PT sessions today.
          </div>
        ) : (
          <div className="space-y-2">
            {(() => {
              type TimelineItem = { type: "class"; sortKey: string; data: Class } | { type: "pt"; sortKey: string; data: PtSession };
              const items: TimelineItem[] = [];
              todayClasses.forEach((cls) => items.push({ type: "class", sortKey: cls.start_time, data: cls }));
              todayPtSessions.forEach((s) => {
                const dt = new Date(s.scheduled_at);
                const sgt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
                const hh = sgt.getHours().toString().padStart(2, "0");
                const mm = sgt.getMinutes().toString().padStart(2, "0");
                items.push({ type: "pt", sortKey: `${hh}:${mm}`, data: s });
              });
              items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
              return items.map((item) => {
                if (item.type === "class") {
                  const cls = item.data as Class;
                  const past = isClassPast(cls.end_time);
                  return (
                    <div
                      key={`class-${cls.id}`}
                      className={`bg-jai-card border border-jai-border rounded-xl p-4 ${past ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{cls.name}</p>
                          <p className="text-jai-text text-sm">
                            {cls.start_time.slice(0, 5)} - {cls.end_time.slice(0, 5)}
                          </p>
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded-full bg-jai-blue/10 text-jai-blue border border-jai-blue/20">
                          Class
                        </span>
                      </div>
                    </div>
                  );
                } else {
                  const s = item.data as PtSession;
                  const ptPast = isPtPast(s.scheduled_at, s.duration_minutes || 60);
                  return <PtCard key={`pt-${s.id}`} s={s} isPast={ptPast} />;
                }
              });
            })()}
          </div>
        )}
      </section>

      {/* Tomorrow's Schedule */}
      <section>
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
          Tomorrow&apos;s Schedule
        </h2>
        {(() => {
          const tomorrowDateObj = new Date(Date.now() + 86400000);
          const tomorrowStr = tomorrowDateObj.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
          const tomorrowHoliday = isPublicHoliday(tomorrowStr);
          const tomorrowLabel = tomorrowDateObj.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Asia/Singapore",
          });

          if (tomorrowHoliday) {
            return (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <p className="font-medium text-red-400">Gym Closed</p>
                <p className="text-red-400/70 text-sm">{tomorrowHoliday.name}</p>
              </div>
            );
          }

          type TItem = { type: "class"; sortKey: string; data: Class } | { type: "pt"; sortKey: string; data: PtSession };
          const tItems: TItem[] = [];
          tomorrowClasses.forEach((cls) => tItems.push({ type: "class", sortKey: cls.start_time, data: cls }));
          tomorrowPtSessions.forEach((s) => {
            const dt = new Date(s.scheduled_at);
            const sgt = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
            const hh = sgt.getHours().toString().padStart(2, "0");
            const mm = sgt.getMinutes().toString().padStart(2, "0");
            tItems.push({ type: "pt", sortKey: `${hh}:${mm}`, data: s });
          });
          tItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

          if (tItems.length === 0) {
            return (
              <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-sm">
                No classes or PT sessions tomorrow.
              </div>
            );
          }

          return (
            <div className="space-y-2">
              <p className="text-xs text-jai-text capitalize">{tomorrowLabel}</p>
              {tItems.map((item) => {
                if (item.type === "class") {
                  const cls = item.data as Class;
                  return (
                    <div key={`tmr-class-${cls.id}`} className="bg-jai-card border border-jai-border rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{cls.name}</p>
                          <p className="text-jai-text text-sm">
                            {cls.start_time.slice(0, 5)} - {cls.end_time.slice(0, 5)}
                          </p>
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded-full bg-jai-blue/10 text-jai-blue border border-jai-blue/20">
                          Class
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
          );
        })()}
      </section>


      {/* Next Week PT */}
      {nextWeekPtSessions.length > 0 && (
        <NextWeekPtSection sessions={nextWeekPtSessions} />
      )}
    </div>
  );
}

function NextWeekPtSection({ sessions }: { sessions: PtSession[] }) {
  const scheduled = sessions.filter((s) => s.status === "scheduled" || s.status === "confirmed");
  const resolved = sessions.filter((s) => s.status === "completed" || s.status === "cancelled" || s.status === "no_show");

  return (
    <section>
      <h2 className="text-base font-semibold mb-3">Next Week PT ({scheduled.length})</h2>
      <div className="space-y-2">
        {scheduled.map((s) => (
          <PtCard key={s.id} s={s} showDate />
        ))}
        {resolved.map((s) => (
          <PtCard key={s.id} s={s} showDate />
        ))}
      </div>
    </section>
  );
}
