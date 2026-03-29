"use client";

import { useState, useRef, useEffect } from "react";
import { Class, DayOfWeek, User } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/client";
import { createNotification } from "@/app/actions/notifications";

const DAYS: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

export function ClassModal({
  cls,
  coaches,
  onClose,
  onSaved,
}: {
  cls: Class | null;
  coaches: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build a complete coach lookup map from props + class data
  const coachMap = new Map<string, string>();
  for (const c of coaches) coachMap.set(c.id, c.full_name);
  if (cls?.lead_coach) coachMap.set(cls.lead_coach.id, cls.lead_coach.full_name);
  if (cls?.assistant_coach) coachMap.set(cls.assistant_coach.id, cls.assistant_coach.full_name);
  if (cls?.class_coaches) {
    for (const cc of cls.class_coaches) {
      if (cc.coach) coachMap.set(cc.coach.id, cc.coach.full_name);
    }
  }

  const getInitialCoachIds = (): string[] => {
    if (!cls) return [];
    const ids: string[] = [];
    if (cls.lead_coach_id) ids.push(cls.lead_coach_id);
    if (cls.class_coaches) {
      for (const cc of cls.class_coaches) {
        if (!cc.is_lead && !ids.includes(cc.coach_id)) {
          ids.push(cc.coach_id);
        }
      }
    }
    if (cls.assistant_coach_id && !ids.includes(cls.assistant_coach_id)) {
      ids.push(cls.assistant_coach_id);
    }
    return ids;
  };

  const [form, setForm] = useState({
    name: cls?.name || "",
    day_of_week: cls?.day_of_week || ("monday" as DayOfWeek),
    start_time: cls?.start_time?.slice(0, 5) || "18:00",
    end_time: cls?.end_time?.slice(0, 5) || "19:00",
    selectedCoachIds: getInitialCoachIds(),
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addCoach = (coachId: string) => {
    setForm((prev) => ({
      ...prev,
      selectedCoachIds: [...prev.selectedCoachIds, coachId],
    }));
    setDropdownOpen(false);
  };

  const removeCoach = (coachId: string) => {
    setForm((prev) => ({
      ...prev,
      selectedCoachIds: prev.selectedCoachIds.filter((id) => id !== coachId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const leadCoachId = form.selectedCoachIds[0] || null;
    const assistantCoachId = form.selectedCoachIds[1] || null;

    const classData = {
      name: form.name,
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      lead_coach_id: leadCoachId,
      assistant_coach_id: assistantCoachId,
      is_active: true,
    };

    let classId = cls?.id;

    if (cls) {
      console.log("[ClassModal] Updating class", cls.id, classData);
      const { data: updated, error: updateErr } = await supabase
        .from("classes")
        .update(classData)
        .eq("id", cls.id)
        .select("id");
      console.log("[ClassModal] Update result:", updateErr ? updateErr.message : "success", "rows:", updated?.length);
      if (updateErr) {
        setError(`Update failed: ${updateErr.message}`);
        setLoading(false);
        return;
      }
      if (!updated || updated.length === 0) {
        setError("Update blocked — no rows changed. Check RLS policies on the classes table (admin needs UPDATE permission).");
        setLoading(false);
        return;
      }
    } else {
      console.log("[ClassModal] Inserting class", classData);
      const { data: inserted, error: insertErr } = await supabase
        .from("classes")
        .insert(classData)
        .select("id")
        .single();
      console.log("[ClassModal] Insert result:", insertErr ? insertErr.message : inserted?.id);
      if (insertErr) {
        setError(`Insert failed: ${insertErr.message}`);
        setLoading(false);
        return;
      }
      classId = inserted.id;
    }

    if (classId) {
      console.log("[ClassModal] Deleting old class_coaches for", classId);
      const { error: deleteErr } = await supabase
        .from("class_coaches")
        .delete()
        .eq("class_id", classId);
      if (deleteErr) {
        console.error("[ClassModal] class_coaches delete failed:", deleteErr.message);
        setError(`Failed to update coaches: ${deleteErr.message}. Check RLS policies on class_coaches table.`);
        setLoading(false);
        return;
      }
      if (form.selectedCoachIds.length > 0) {
        const coachRows = form.selectedCoachIds.map((coachId, i) => ({
          class_id: classId!,
          coach_id: coachId,
          is_lead: i === 0,
        }));
        console.log("[ClassModal] Inserting class_coaches", coachRows);
        const { error: ccErr } = await supabase.from("class_coaches").insert(coachRows);
        if (ccErr) {
          console.error("[ClassModal] class_coaches insert failed:", ccErr.message);
          setError(`Coach assignment failed: ${ccErr.message}`);
          setLoading(false);
          return;
        }
      }
      console.log("[ClassModal] All saves complete");

      // Notify coaches about changes
      const previousCoachIds = getInitialCoachIds();
      const dayLabel = form.day_of_week.charAt(0).toUpperCase() + form.day_of_week.slice(1);
      const formatTime12 = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        const period = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, "0")} ${period}`;
      };
      const timeLabel = formatTime12(form.start_time);

      for (const coachId of form.selectedCoachIds) {
        if (!previousCoachIds.includes(coachId) || !cls) {
          // New coach assignment (or new class)
          createNotification(
            coachId,
            cls ? "class_updated" : "class_assigned",
            cls ? "Class Updated" : "New Class Assigned",
            `You've been assigned to ${form.name} on ${dayLabel} ${timeLabel}.`
          ).catch((err) => console.error("Failed to create class notification:", err));
        }
      }

      // Notify coaches who were removed from the class
      if (cls) {
        for (const coachId of previousCoachIds) {
          if (!form.selectedCoachIds.includes(coachId)) {
            createNotification(
              coachId,
              "class_cancelled",
              "Removed from Class",
              `You've been removed from ${form.name} on ${dayLabel} ${timeLabel}.`
            ).catch((err) => console.error("Failed to create class notification:", err));
          }
        }
      }

      // If editing and class details changed, notify all remaining assigned coaches
      if (cls && (cls.name !== form.name || cls.start_time?.slice(0, 5) !== form.start_time || cls.end_time?.slice(0, 5) !== form.end_time || cls.day_of_week !== form.day_of_week)) {
        for (const coachId of form.selectedCoachIds) {
          if (previousCoachIds.includes(coachId)) {
            createNotification(
              coachId,
              "class_updated",
              "Class Updated",
              `${form.name} on ${dayLabel} has been updated to ${timeLabel} - ${formatTime12(form.end_time)}.`
            ).catch((err) => console.error("Failed to create class notification:", err));
          }
        }
      }
    }

    setLoading(false);
    onSaved();
  };

  const coachName = (id: string) => coachMap.get(id) || "Unknown";

  const availableCoaches = coaches.filter(
    (c) => !form.selectedCoachIds.includes(c.id)
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center">
      <div className="bg-jai-card border-t md:border border-jai-border md:rounded-xl w-full md:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl md:rounded-t-xl">
        <div className="sticky top-0 bg-jai-card p-4 md:p-6 border-b border-jai-border flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {cls ? "Edit Class" : "Add New Class"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-jai-text hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
          <div>
            <label className="block text-sm text-jai-text mb-1">Class Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-3 md:py-2 bg-jai-bg border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue text-base"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-jai-text mb-1">Day</label>
            <select
              value={form.day_of_week}
              onChange={(e) => setForm({ ...form, day_of_week: e.target.value as DayOfWeek })}
              className="w-full px-3 py-3 md:py-2 bg-jai-bg border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue text-base"
            >
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-jai-text mb-1">Start</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full px-3 py-3 md:py-2 bg-jai-bg border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue text-base"
              />
            </div>
            <div>
              <label className="block text-sm text-jai-text mb-1">End</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className="w-full px-3 py-3 md:py-2 bg-jai-bg border border-jai-border rounded-lg text-white focus:outline-none focus:border-jai-blue text-base"
              />
            </div>
          </div>

          {/* Coach dropdown + chips */}
          <div>
            <label className="block text-sm text-jai-text mb-1">
              Coaches <span className="opacity-60">(first = lead)</span>
            </label>

            {/* Selected coach chips */}
            {form.selectedCoachIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {form.selectedCoachIds.map((id, i) => (
                  <span
                    key={id}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-sm ${
                      i === 0
                        ? "bg-jai-blue/20 text-jai-blue"
                        : "bg-white/10 text-jai-text"
                    }`}
                  >
                    {i === 0 && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide mr-0.5 bg-jai-blue text-white px-1.5 py-0.5 rounded">
                        Lead
                      </span>
                    )}
                    {coachName(id)}
                    <button
                      type="button"
                      onClick={() => removeCoach(id)}
                      className="ml-0.5 hover:text-white min-w-[20px] min-h-[20px] flex items-center justify-center"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full px-3 py-3 md:py-2 bg-jai-bg border border-jai-border rounded-lg text-left text-jai-text hover:border-jai-blue/50 transition-colors text-base flex items-center justify-between"
              >
                <span>
                  {availableCoaches.length > 0
                    ? "Add a coach..."
                    : "All coaches selected"}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && availableCoaches.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-jai-card border border-jai-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {availableCoaches.map((coach) => (
                    <button
                      key={coach.id}
                      type="button"
                      onClick={() => addCoach(coach.id)}
                      className="w-full text-left px-3 py-3 md:py-2.5 text-sm text-jai-text hover:text-white hover:bg-white/5 transition-colors border-b border-jai-border last:border-b-0"
                    >
                      {coach.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 md:py-2 border border-jai-border text-jai-text rounded-lg hover:text-white transition-colors text-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 md:py-2 bg-jai-blue text-white rounded-lg hover:bg-jai-blue/90 disabled:opacity-50 transition-colors text-base font-medium"
            >
              {loading ? "Saving..." : cls ? "Update" : "Add Class"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
