"use client";

import { useState } from "react";
import { Class, PtPackage, PtSession, User } from "@/lib/types/database";
import { MetricCard } from "./metric-card";
import { ScheduleGrid } from "./schedule-grid";
import { ClassModal } from "./class-modal";
import { useRouter } from "next/navigation";

export function AdminDashboard({
  todayClasses,
  allClasses,
  ptPackages,
  ptSessions,
  coaches,
  totalActiveClasses,
  activePtPackages,
  today,
}: {
  todayClasses: Class[];
  allClasses: Class[];
  ptPackages: PtPackage[];
  ptSessions: PtSession[];
  coaches: User[];
  totalActiveClasses: number;
  activePtPackages: number;
  today: string;
}) {
  const [sundayReminder, setSundayReminder] = useState(true);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const router = useRouter();

  const activePackages = ptPackages.filter(
    (pt) => pt.status === "active" && pt.sessions_used < pt.total_sessions
  );

  const upcomingSessions = ptSessions.filter(
    (s) => s.status === "scheduled" || s.status === "confirmed"
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
        <p className="text-jai-text text-sm mt-1 capitalize">
          {today} &middot;{" "}
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <MetricCard title="Today's Classes" value={todayClasses.length} />
        <MetricCard title="Weekly Classes" value={totalActiveClasses} />
        <MetricCard title="Active PT" value={activePtPackages} />
        <MetricCard title="Upcoming PT" value={upcomingSessions.length} />
      </div>

      {/* Today's Schedule */}
      <section>
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
          Today&apos;s Schedule
        </h2>
        {todayClasses.length === 0 ? (
          <div className="bg-jai-card border border-jai-border rounded-xl p-4 md:p-6 text-jai-text text-sm">
            No classes scheduled for today.
          </div>
        ) : (
          <div className="space-y-2 md:space-y-3">
            {todayClasses.map((cls) => (
              <div
                key={cls.id}
                className="bg-jai-card border border-jai-border rounded-xl p-3 md:p-4"
              >
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
            ))}
          </div>
        )}
      </section>

      {/* Active PT Packages */}
      <section>
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
          Active PT Packages
        </h2>
        {/* Desktop table */}
        <div className="hidden md:block bg-jai-card border border-jai-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-jai-border text-left text-sm text-jai-text">
                <th className="p-4">Member</th>
                <th className="p-4">Coach</th>
                <th className="p-4">Sessions</th>
                <th className="p-4">Remaining</th>
                <th className="p-4">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {activePackages.map((pt) => {
                const remaining = pt.total_sessions - pt.sessions_used;
                return (
                  <tr key={pt.id} className="border-b border-jai-border last:border-b-0">
                    <td className="p-4">{pt.member?.full_name || "—"}</td>
                    <td className="p-4 text-jai-text">{pt.coach?.full_name || "—"}</td>
                    <td className="p-4">
                      <span className={remaining <= 0 ? "text-red-400" : remaining <= 2 ? "text-yellow-400" : "text-jai-blue"}>
                        {pt.sessions_used}/{pt.total_sessions}
                      </span>
                    </td>
                    <td className="p-4">{remaining}</td>
                    <td className="p-4 text-jai-text">{pt.expiry_date || "—"}</td>
                  </tr>
                );
              })}
              {activePackages.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-jai-text text-center">No active PT packages</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {activePackages.map((pt) => {
            const remaining = pt.total_sessions - pt.sessions_used;
            return (
              <div key={pt.id} className="bg-jai-card border border-jai-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{pt.member?.full_name || "—"}</p>
                  <span className={`text-sm font-medium ${remaining <= 0 ? "text-red-400" : remaining <= 2 ? "text-yellow-400" : "text-jai-blue"}`}>
                    {pt.sessions_used}/{pt.total_sessions}
                  </span>
                </div>
                <p className="text-jai-text text-xs mt-1">
                  Coach: {pt.coach?.full_name || "—"}
                  {pt.expiry_date && ` · Exp: ${pt.expiry_date}`}
                </p>
              </div>
            );
          })}
          {activePackages.length === 0 && (
            <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-sm text-center">
              No active PT packages
            </div>
          )}
        </div>
      </section>

      {/* Sunday Reminder Toggle */}
      <section>
        <div className="bg-jai-card border border-jai-border rounded-xl p-4 md:p-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm md:text-base">Sunday PT Reminder</h3>
            <p className="text-jai-text text-xs md:text-sm">
              Auto-send WhatsApp reminders
            </p>
          </div>
          <button
            onClick={() => setSundayReminder(!sundayReminder)}
            className={`w-12 h-7 rounded-full transition-colors relative flex-shrink-0 ${
              sundayReminder ? "bg-jai-blue" : "bg-jai-border"
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                sundayReminder ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
      </section>

      {/* Weekly Schedule */}
      <section>
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-base md:text-lg font-semibold">Weekly Schedule</h2>
          <button
            onClick={() => setShowAddClass(true)}
            className="px-4 py-2.5 md:py-2 bg-jai-blue text-white text-sm rounded-lg hover:bg-jai-blue/90 transition-colors min-h-[44px] md:min-h-0"
          >
            + Add Class
          </button>
        </div>
        <ScheduleGrid
          classes={allClasses}
          onEdit={setEditingClass}
          showActions
        />
      </section>

      {(editingClass || showAddClass) && (
        <ClassModal
          cls={editingClass}
          coaches={coaches}
          onClose={() => {
            setEditingClass(null);
            setShowAddClass(false);
          }}
          onSaved={() => {
            setEditingClass(null);
            setShowAddClass(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
