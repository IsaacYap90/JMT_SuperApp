"use client";

import { useState } from "react";
import { Class, User } from "@/lib/types/database";
import { ScheduleGrid } from "./schedule-grid";
import { ClassModal } from "./class-modal";
import { useRouter } from "next/navigation";

export function SchedulePageClient({
  classes,
  coaches,
  isAdmin,
}: {
  classes: Class[];
  coaches: User[];
  isAdmin: boolean;
}) {
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const router = useRouter();

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
