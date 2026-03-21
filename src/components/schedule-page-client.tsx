"use client";

import { useState, useCallback } from "react";
import { Class, User } from "@/lib/types/database";
import { ScheduleGrid } from "./schedule-grid";
import { ClassModal } from "./class-modal";
import { createClient } from "@/lib/supabase/client";

const CLASS_SELECT =
  "*, lead_coach:users!classes_lead_coach_id_fkey(*), assistant_coach:users!classes_assistant_coach_id_fkey(*), class_coaches(*, coach:users(*))";

export function SchedulePageClient({
  classes: initialClasses,
  coaches,
  isAdmin,
}: {
  classes: Class[];
  coaches: User[];
  isAdmin: boolean;
}) {
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const [classes, setClasses] = useState<Class[]>(initialClasses);

  const refetchClasses = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("classes")
      .select(CLASS_SELECT)
      .eq("is_active", true)
      .order("start_time");
    if (data) setClasses(data as unknown as Class[]);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Weekly Schedule</h1>
        {isAdmin && (
          <button
            onClick={() => setShowAddClass(true)}
            className="px-4 py-2 bg-jai-blue text-white text-sm rounded-lg hover:bg-jai-blue/90 transition-colors"
          >
            + Add Class
          </button>
        )}
      </div>

      <ScheduleGrid
        classes={classes}
        onEdit={isAdmin ? setEditingClass : undefined}
        showActions={isAdmin}
      />

      {(editingClass || showAddClass) && (
        <ClassModal
          cls={editingClass}
          coaches={coaches}
          onClose={() => {
            setEditingClass(null);
            setShowAddClass(false);
          }}
          onSaved={async () => {
            setEditingClass(null);
            setShowAddClass(false);
            await refetchClasses();
          }}
        />
      )}
    </div>
  );
}
