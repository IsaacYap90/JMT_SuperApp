"use client";

import { Class, DayOfWeek } from "@/lib/types/database";

const DAYS: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const DAY_INDEX: Record<DayOfWeek, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 0,
};

function getWeekDates(): Record<DayOfWeek, string> {
  // Use SGT timezone to get correct current day
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const currentDay = now.getDay(); // 0=Sun
  // Find Monday: on Sunday show upcoming week, otherwise current week
  const diffToMon = currentDay === 0 ? 1 : 1 - currentDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);

  const result: Record<string, string> = {};
  for (const day of DAYS) {
    const target = DAY_INDEX[day];
    const offset = target === 0 ? 6 : target - 1; // Mon=0 offset
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    result[day] = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Singapore" }).toUpperCase();
  }
  return result as Record<DayOfWeek, string>;
}

function getCoachNames(cls: Class): string {
  const names: string[] = [];
  if (cls.lead_coach) names.push(cls.lead_coach.full_name);
  if (cls.class_coaches) {
    for (const cc of cls.class_coaches) {
      if (!cc.is_lead && cc.coach && !names.includes(cc.coach.full_name)) {
        names.push(cc.coach.full_name);
      }
    }
  }
  if (cls.assistant_coach && !names.includes(cls.assistant_coach.full_name)) {
    names.push(cls.assistant_coach.full_name);
  }
  return names.join(", ");
}

export function ScheduleGrid({
  classes,
  onEdit,
  showActions = false,
}: {
  classes: Class[];
  onEdit?: (cls: Class) => void;
  showActions?: boolean;
}) {
  const weekDates = getWeekDates();

  return (
    <>
      {/* Desktop: 7-column grid */}
      <div className="hidden md:block bg-jai-card border border-jai-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-jai-border">
          {DAYS.map((day) => (
            <div
              key={day}
              className="p-3 text-center border-r border-jai-border last:border-r-0"
            >
              <p className="text-sm font-medium text-jai-text">{DAY_LABELS[day]}</p>
              <p className="text-[10px] text-jai-text/60">{weekDates[day]}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 min-h-[200px]">
          {DAYS.map((day) => {
            const dayClasses = classes
              .filter((c) => c.day_of_week === day)
              .sort((a, b) => a.start_time.localeCompare(b.start_time));
            return (
              <div
                key={day}
                className="border-r border-jai-border last:border-r-0 p-2 space-y-2"
              >
                {dayClasses.map((cls) => {
                  const coachStr = getCoachNames(cls);
                  return (
                    <div
                      key={cls.id}
                      className="p-2 rounded-lg text-xs bg-jai-blue/10 text-jai-blue"
                    >
                      <p className="font-medium">{cls.name}</p>
                      <p className="opacity-70">
                        {cls.start_time.slice(0, 5)}-{cls.end_time.slice(0, 5)}
                      </p>
                      {coachStr && <p className="opacity-70">{coachStr}</p>}
                      {showActions && onEdit && (
                        <div className="mt-1">
                          <button
                            onClick={() => onEdit(cls)}
                            className="text-jai-text hover:text-white"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: stacked day sections */}
      <div className="md:hidden space-y-4">
        {DAYS.map((day) => {
          const dayClasses = classes
            .filter((c) => c.day_of_week === day)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

          if (dayClasses.length === 0) return null;

          return (
            <div key={day}>
              <h3 className="text-sm font-semibold text-jai-text mb-2 uppercase tracking-wide">
                {day.charAt(0).toUpperCase() + day.slice(1)}, {weekDates[day]}
              </h3>
              <div className="space-y-2">
                {dayClasses.map((cls) => {
                  const coachStr = getCoachNames(cls);
                  return (
                    <div
                      key={cls.id}
                      className="bg-jai-card border border-jai-border rounded-xl p-4 flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{cls.name}</p>
                        <p className="text-jai-text text-sm">
                          {cls.start_time.slice(0, 5)} - {cls.end_time.slice(0, 5)}
                        </p>
                        {coachStr && (
                          <p className="text-jai-blue text-xs mt-0.5">{coachStr}</p>
                        )}
                      </div>
                      {showActions && onEdit && (
                        <button
                          onClick={() => onEdit(cls)}
                          className="ml-3 text-jai-text hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
