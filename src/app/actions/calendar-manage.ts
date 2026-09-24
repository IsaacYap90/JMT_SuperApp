"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { coachReschedulePtSession, coachUpdatePtStatus, updatePtSession, updateSessionStatus } from "./pt";
import { parsePtScheduledAt, assertValidPtDuration } from "@/lib/pt-schedule";

type StaffRole = "coach" | "admin" | "master_admin" | "member";

/** Calendar links grant no access: authorize the signed-in actor again on every save. */
export async function manageCalendarPt(sessionId: string, change: { scheduledAt: string; durationMinutes: number; coachId: string } | { cancel: true }): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const db = createAdminClient();
  const { data: actor } = await db.from("users").select("role, is_active").eq("id", user.id).single();
  if (!actor?.is_active || !["master_admin", "coach"].includes(actor.role)) throw new Error("Not authorized");
  const { data: session } = await db.from("pt_sessions").select("coach_id, status").eq("id", sessionId).single();
  if (!session || (actor.role !== "master_admin" && session.coach_id !== user.id)) throw new Error("PT not found or not assigned to you");
  if (!["scheduled", "confirmed"].includes(session.status)) throw new Error("Cannot change a resolved PT session");
  if ("cancel" in change) {
    if (actor.role === "master_admin") await updateSessionStatus(sessionId, "cancelled");
    else await coachUpdatePtStatus(sessionId, "cancelled");
    return;
  }
  const time = parsePtScheduledAt(change.scheduledAt);
  assertValidPtDuration(change.durationMinutes);
  if (time.getTime() <= Date.now()) throw new Error("Choose a future PT time");
  if (actor.role === "master_admin") {
    const { data: coach } = await db.from("users").select("role, is_active").eq("id", change.coachId).single();
    if (!coach?.is_active || !["coach", "master_admin"].includes(coach.role)) throw new Error("Choose an active coach");
    await updatePtSession(sessionId, { scheduled_at: time.toISOString(), duration_minutes: change.durationMinutes, coach_id: change.coachId });
  } else {
    if (change.coachId !== user.id) throw new Error("Only Jeremy can reassign PT");
    await coachReschedulePtSession(sessionId, time.toISOString(), change.durationMinutes);
  }
  revalidatePath("/calendar/manage");
}

async function requireMasterAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role as StaffRole) !== "master_admin") {
    throw new Error("Only Coach Jeremy can make this calendar change");
  }
  return user.id;
}

/**
 * Turns a Calendar-created placeholder into a real JMT PT.  The database RPC
 * does the authorization and all related writes atomically; this action never
 * trusts a calendar event title for client or coach identity.
 */
export async function completeGoogleCalendarPtDraft(
  draftId: string,
  memberId: string,
  coachId: string
): Promise<{ sessionId: string }> {
  const actorId = await requireMasterAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_gcal_pt_draft", {
    p_draft_id: draftId,
    p_actor_id: actorId,
    p_member_id: memberId,
    p_coach_id: coachId,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) throw new Error("Could not create the PT session");
  revalidatePath("/pt");
  revalidatePath("/schedule");
  revalidatePath("/");
  return { sessionId: data };
}

/** Class time is deliberately absent: Calendar can only change recurring coach assignments. */
export async function assignGoogleCalendarClassCoaches(
  classId: string,
  coachIds: string[]
): Promise<void> {
  const actorId = await requireMasterAdmin();
  const uniqueCoachIds = Array.from(new Set(coachIds));
  const admin = createAdminClient();
  const { error } = await admin.rpc("assign_gcal_class_coaches", {
    p_class_id: classId,
    p_actor_id: actorId,
    p_coach_ids: uniqueCoachIds,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/schedule");
  revalidatePath("/");
}
