"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/types/database";
import { assertCoachesAvailableForClass } from "@/lib/leave-conflicts";

export type SaveClassPayload = {
  id?: string;
  name: string;
  day_of_week: string | null;
  event_date: string | null;
  class_kind: "regular" | "corporate";
  start_time: string;
  end_time: string;
  selected_coach_ids: string[];
};

async function requireScheduleAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase.from("users").select("role, is_active").eq("id", user.id).single();
  if (!profile?.is_active || !isAdmin(profile.role)) throw new Error("Not authorized to edit the schedule");
}

/**
 * Single server-side class save path. Coach assignment is checked against
 * approved leave before any class or bridge-table row is changed.
 */
export async function saveClassWithCoaches(payload: SaveClassPayload): Promise<{ id: string }> {
  await requireScheduleAdmin();
  const coachIds = Array.from(new Set(payload.selected_coach_ids));
  if (coachIds.length !== payload.selected_coach_ids.length) throw new Error("Choose each coach only once");
  if (!payload.name.trim()) throw new Error("Class name is required");
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(payload.start_time) || !/^\d{2}:\d{2}(:\d{2})?$/.test(payload.end_time) || payload.start_time >= payload.end_time) {
    throw new Error("Choose a valid class time");
  }
  if (payload.event_date ? payload.day_of_week !== null : !payload.day_of_week) {
    throw new Error("Choose either a weekly day or a one-off date");
  }

  const admin = createAdminClient();
  if (coachIds.length) {
    const { data: coaches, error } = await admin
      .from("users")
      .select("id, role, is_active")
      .in("id", coachIds);
    if (error) throw new Error(error.message);
    if ((coaches || []).length !== coachIds.length || (coaches || []).some((coach) => !coach.is_active || !["coach", "admin", "master_admin"].includes(coach.role))) {
      throw new Error("Choose active coaches only");
    }
  }
  await assertCoachesAvailableForClass(admin, coachIds, {
    day_of_week: payload.day_of_week,
    event_date: payload.event_date,
    start_time: payload.start_time,
    end_time: payload.end_time,
  });

  const classData = {
    name: payload.name.trim(),
    day_of_week: payload.day_of_week,
    event_date: payload.event_date,
    class_kind: payload.class_kind,
    start_time: payload.start_time,
    end_time: payload.end_time,
    lead_coach_id: coachIds[0] || null,
    assistant_coach_id: coachIds[1] || null,
    is_active: true,
  };
  let classId = payload.id;
  if (classId) {
    const { error } = await admin.from("classes").update(classData).eq("id", classId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await admin.from("classes").insert(classData).select("id").single();
    if (error) throw new Error(error.message);
    classId = data.id;
  }
  const { error: removeError } = await admin.from("class_coaches").delete().eq("class_id", classId);
  if (removeError) throw new Error(removeError.message);
  if (coachIds.length) {
    const { error: assignError } = await admin.from("class_coaches").insert(
      coachIds.map((coachId, index) => ({ class_id: classId, coach_id: coachId, is_lead: index === 0 }))
    );
    if (assignError) throw new Error(assignError.message);
  }
  if (!classId) throw new Error("Could not save class");
  revalidatePath("/");
  revalidatePath("/schedule");
  return { id: classId };
}
