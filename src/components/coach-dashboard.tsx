"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Class, PtSession } from "@/lib/types/database";
import { MetricCard } from "./metric-card";
import { getTodayHoliday } from "@/lib/sg-holidays";
import { NotificationBell } from "./notification-bell";
import { coachUpdatePtStatus } from "@/app/actions/pt";

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
  totalWeekClasses,
  weekPtSessions,
  nextWeekPtSessions,
  coachName,
  today,
}: {
  todayClasses: Class[];
  todayPtSessions: PtSession[];
  totalWeekClasses: number;
  weekPtSessions: number;
  nextWeekPtSessions: PtSession[];
  coachName: string;
  today: string;
}) {
  const todayHoliday = getTodayHoliday();

  const totalClassHours = todayHoliday ? 0 : todayClasses.reduce(
    (sum, c) => sum + calcHours(c.start_time, c.end_time),
    0
  );
  const totalPtHours = todayHoliday ? 0 : todayPtSessions.reduce(
    (sum, s) => sum + (s.duration_minutes || 60) / 60,
    0
  );
  const totalHours = totalClassHours + totalPtHours;

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

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard title="Today's Classes" value={todayClasses.length} />
        <MetricCard title="Today's PT" value={todayPtSessions.length} />
        <MetricCard title="Working Hours" value={`${totalHours.toFixed(1)}h`} />
        <MetricCard title="PT This Week" value={weekPtSessions} />
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
                  const dt = new Date(s.scheduled_at);
                  const time = dt.toLocaleTimeString("en-SG", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "Asia/Singapore",
                  });
                  const ptPast = isPtPast(s.scheduled_at, s.duration_minutes || 60);
                  return (
                    <div
                      key={`pt-${s.id}`}
                      className={`bg-jai-card border border-jai-border rounded-xl p-4 ${ptPast ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">
                            PT — {s.member?.full_name || "Client"}
                          </p>
                          <p className="text-jai-text text-sm">
                            {time} · {s.duration_minutes || 60}min
                          </p>
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                          PT
                        </span>
                      </div>
                    </div>
                  );
                }
              });
            })()}
          </div>
        )}
      </section>

      {/* This Week Summary */}
      <section>
        <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-jai-text uppercase tracking-wide mb-2">
            This Week
          </h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-jai-text">Total classes</span>
            <span className="font-medium">{totalWeekClasses}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-jai-text">Total PT sessions</span>
            <span className="font-medium">{weekPtSessions}</span>
          </div>
        </div>
      </section>

      {/* Next Week PT */}
      {nextWeekPtSessions.length > 0 && (
        <NextWeekPtSection sessions={nextWeekPtSessions} />
      )}
    </div>
  );
}

function NextWeekPtSection({ sessions: initialSessions }: { sessions: PtSession[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const router = useRouter();

  const handleStatus = async (sessionId: string, status: "completed" | "cancelled") => {
    setUpdatingId(sessionId);
    try {
      await coachUpdatePtStatus(sessionId, status);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status } : s)));
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
    setUpdatingId(null);
  };

  const scheduledSessions = sessions.filter((s) => s.status === "scheduled" || s.status === "confirmed");
  const resolvedSessions = sessions.filter((s) => s.status === "completed" || s.status === "cancelled");

  return (
    <section>
      <h2 className="text-base font-semibold mb-3">Next Week PT ({scheduledSessions.length})</h2>
      <div className="space-y-2">
        {scheduledSessions.map((s) => {
          const dt = new Date(s.scheduled_at);
          const dayLabel = dt.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: "Asia/Singapore",
          });
          const timeLabel = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
          const isUpdating = updatingId === s.id;
          return (
            <div
              key={s.id}
              className="bg-jai-card border border-jai-border rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">
                    PT — {s.member?.full_name || "Client"}
                  </p>
                  <p className="text-jai-text text-sm">
                    {dayLabel} · {timeLabel} · {s.duration_minutes || 60}min
                  </p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  PT
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleStatus(s.id, "completed")}
                  disabled={isUpdating}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                >
                  {isUpdating ? "..." : "Completed"}
                </button>
                <button
                  onClick={() => handleStatus(s.id, "cancelled")}
                  disabled={isUpdating}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                >
                  {isUpdating ? "..." : "Cancelled"}
                </button>
              </div>
            </div>
          );
        })}
        {resolvedSessions.map((s) => {
          const dt = new Date(s.scheduled_at);
          const dayLabel = dt.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: "Asia/Singapore",
          });
          const timeLabel = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
          return (
            <div
              key={s.id}
              className="bg-jai-card border border-jai-border rounded-xl p-4 opacity-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">
                    PT — {s.member?.full_name || "Client"}
                  </p>
                  <p className="text-jai-text text-sm">
                    {dayLabel} · {timeLabel} · {s.duration_minutes || 60}min
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full ${
                  s.status === "completed"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {s.status === "completed" ? "Done" : "Cancelled"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
