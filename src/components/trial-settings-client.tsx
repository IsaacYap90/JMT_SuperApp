"use client";

import { useState } from "react";
import { updateTrialSettingBatch } from "@/app/actions/trials";

interface ClassItem {
  id: string;
  name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  programme: string | null;
}

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

const PROGRAMME_LABELS: Record<string, string> = {
  adult: "Adult",
  kids: "Kids",
  teens: "Teens",
};

// Adult: only these time slots
const ADULT_TRIAL_SLOTS = ["12:15", "18:30"];

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function TrialSettingsClient({
  classes,
  settingsMap: initialSettings,
}: {
  classes: ClassItem[];
  settingsMap: Record<string, { is_trial_enabled: boolean; max_trial_spots: number }>;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState<string | null>(null);

  // Group by programme
  const programmes = Array.from(new Set(classes.map((c) => c.programme).filter(Boolean))) as string[];
  const programmeOrder = ["adult", "kids", "teens"];

  const getSlotClasses = (programme: string, startTime: string) =>
    classes.filter(
      (c) =>
        c.programme === programme &&
        c.start_time.slice(0, 5) === startTime &&
        !c.name.toLowerCase().includes("advanced") &&
        !c.name.toLowerCase().includes("sparring")
    );

  const isDayEnabled = (classId: string) =>
    settings[classId]?.is_trial_enabled || false;

  const getSpots = (programme: string, startTime: string) => {
    const slotClasses = getSlotClasses(programme, startTime);
    for (const c of slotClasses) {
      if (settings[c.id]?.max_trial_spots) return settings[c.id].max_trial_spots;
    }
    return 2;
  };

  const handleDayToggle = async (cls: ClassItem, programme: string, startTime: string) => {
    const newEnabled = !isDayEnabled(cls.id);
    const spots = getSpots(programme, startTime);

    setSettings((prev) => ({
      ...prev,
      [cls.id]: { is_trial_enabled: newEnabled, max_trial_spots: spots },
    }));

    setSaving(cls.id);
    await updateTrialSettingBatch([cls.id], newEnabled, spots);
    setSaving(null);
  };

  const handleSpotsChange = async (programme: string, startTime: string, spots: number) => {
    const slotClasses = getSlotClasses(programme, startTime);
    const enabledIds = slotClasses.filter((c) => isDayEnabled(c.id)).map((c) => c.id);
    if (enabledIds.length === 0) return;

    setSettings((prev) => {
      const next = { ...prev };
      for (const id of enabledIds) {
        next[id] = { ...next[id], max_trial_spots: spots };
      }
      return next;
    });

    setSaving(`${programme}-${startTime}`);
    await updateTrialSettingBatch(enabledIds, true, spots);
    setSaving(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Trial Settings</h1>
        <p className="text-jai-text text-sm mt-1">
          Choose which days allow trial bookings
        </p>
      </div>

      {/* Booking links */}
      <div className="bg-jai-card border border-jai-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold text-jai-text uppercase tracking-wide">Booking Links</h3>
        <div className="space-y-1 text-sm">
          <p>Adult: <span className="text-jai-blue">/book/adult</span></p>
          <p>Kids: <span className="text-jai-blue">/book/kids</span></p>
          <p>Teens: <span className="text-jai-blue">/book/teens</span></p>
        </div>
      </div>

      {programmeOrder
        .filter((p) => programmes.includes(p))
        .map((prog) => {
          // For adult: only 12:15 and 18:30. For kids/teens: all time slots.
          const progClasses = classes.filter((c) => c.programme === prog);
          const timeSlots = Array.from(new Set(progClasses.map((c) => c.start_time.slice(0, 5))));
          const filteredSlots = prog === "adult"
            ? timeSlots.filter((t) => ADULT_TRIAL_SLOTS.includes(t))
            : timeSlots;
          filteredSlots.sort();

          return (
          <section key={prog}>
            <h2 className="text-sm font-semibold text-jai-text uppercase tracking-wide mb-2">
              {PROGRAMME_LABELS[prog]}
            </h2>
            <div className="space-y-3">
              {filteredSlots.map((startTime) => {
                const slotClasses = getSlotClasses(prog, startTime);
                if (slotClasses.length === 0) return null;

                // Sort by day order
                const sorted = [...slotClasses].sort(
                  (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
                );

                const anyEnabled = sorted.some((c) => isDayEnabled(c.id));
                const spots = getSpots(prog, startTime);

                return (
                  <div
                    key={`${prog}-${startTime}`}
                    className="bg-jai-card border border-jai-border rounded-xl p-4"
                  >
                    <p className="font-medium text-sm mb-3">{formatTime(startTime)} Class</p>
                    <div className="flex gap-2 flex-wrap">
                      {sorted.map((cls) => {
                        const enabled = isDayEnabled(cls.id);
                        return (
                          <button
                            key={cls.id}
                            onClick={() => handleDayToggle(cls, prog, startTime)}
                            disabled={saving === cls.id}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[40px] ${
                              enabled
                                ? "bg-jai-blue text-white"
                                : "bg-jai-bg border border-jai-border text-jai-text"
                            }`}
                          >
                            {DAY_SHORT[cls.day_of_week]}
                          </button>
                        );
                      })}
                    </div>
                    {anyEnabled && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs text-jai-text">Max spots per day:</span>
                        <select
                          value={spots}
                          onChange={(e) => handleSpotsChange(prog, startTime, Number(e.target.value))}
                          className="bg-jai-bg border border-jai-border rounded-lg px-2 py-1.5 text-sm min-h-[36px]"
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          );
        })}
    </div>
  );
}
