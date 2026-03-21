"use client";

import { Class, PtPackage } from "@/lib/types/database";
import { ScheduleGrid } from "./schedule-grid";

export function CoachDashboard({
  classes,
  ptPackages,
  coachName,
}: {
  classes: Class[];
  ptPackages: PtPackage[];
  coachName: string;
}) {
  const activePackages = ptPackages.filter(
    (pt) => pt.sessions_used < pt.total_sessions
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Welcome, {coachName}</h1>
        <p className="text-jai-text text-sm mt-1">Your schedule and PT clients</p>
      </div>

      <section>
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">My Weekly Schedule</h2>
        <ScheduleGrid classes={classes} />
      </section>

      <section>
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
          My PT Clients ({activePackages.length} active)
        </h2>
        {/* Desktop table */}
        <div className="hidden md:block bg-jai-card border border-jai-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-jai-border text-left text-sm text-jai-text">
                <th className="p-4">Member</th>
                <th className="p-4">Sessions</th>
                <th className="p-4">Remaining</th>
                <th className="p-4">Expiry</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {ptPackages.map((pt) => {
                const remaining = pt.total_sessions - pt.sessions_used;
                return (
                  <tr key={pt.id} className="border-b border-jai-border last:border-b-0">
                    <td className="p-4 font-medium">{pt.member?.full_name || "—"}</td>
                    <td className="p-4">
                      <span className={remaining <= 0 ? "text-red-400" : remaining <= 2 ? "text-yellow-400" : "text-jai-blue"}>
                        {pt.sessions_used}/{pt.total_sessions}
                      </span>
                    </td>
                    <td className="p-4">{remaining}</td>
                    <td className="p-4 text-jai-text">{pt.expiry_date || "—"}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${pt.status === "active" ? "bg-green-500/10 text-green-400" : "bg-jai-text/10 text-jai-text"}`}>
                        {pt.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {ptPackages.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-jai-text text-center">No PT clients assigned</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {ptPackages.map((pt) => {
            const remaining = pt.total_sessions - pt.sessions_used;
            return (
              <div key={pt.id} className="bg-jai-card border border-jai-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{pt.member?.full_name || "—"}</p>
                  <span className={`text-sm font-medium ${remaining <= 0 ? "text-red-400" : remaining <= 2 ? "text-yellow-400" : "text-jai-blue"}`}>
                    {pt.sessions_used}/{pt.total_sessions}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-jai-text text-xs">
                    {remaining} remaining
                    {pt.expiry_date && ` · Exp: ${pt.expiry_date}`}
                  </p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${pt.status === "active" ? "bg-green-500/10 text-green-400" : "bg-jai-text/10 text-jai-text"}`}>
                    {pt.status}
                  </span>
                </div>
              </div>
            );
          })}
          {ptPackages.length === 0 && (
            <div className="bg-jai-card border border-jai-border rounded-xl p-4 text-jai-text text-sm text-center">
              No PT clients assigned
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
