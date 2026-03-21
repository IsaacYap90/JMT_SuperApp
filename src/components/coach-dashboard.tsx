"use client";

import { Class, PtPackage } from "@/lib/types/database";
import { ScheduleGrid } from "./schedule-grid";

function getSgtGreeting(): string {
  const hour = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" })).getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function CoachDashboard({
  classes,
  ptPackages,
  coachName,
  nextSessions,
}: {
  classes: Class[];
  ptPackages: PtPackage[];
  coachName: string;
  nextSessions: Record<string, string>;
}) {
  const activePackages = ptPackages.filter(
    (pt) => pt.sessions_used < pt.total_sessions
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">{getSgtGreeting()}, {coachName}</h1>
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
        <div className="space-y-2">
          {ptPackages.map((pt) => (
            <div key={pt.id} className="bg-jai-card border border-jai-border rounded-xl p-4">
              <p className="font-medium">{pt.member?.full_name || "—"}</p>
              <p className="text-jai-text text-sm mt-1">
                {nextSessions[pt.user_id]
                  ? `Next session: ${new Date(nextSessions[pt.user_id]).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : "No upcoming session"}
              </p>
            </div>
          ))}
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
