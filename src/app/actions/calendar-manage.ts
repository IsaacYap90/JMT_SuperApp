"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type StaffRole = "coach" | "admin" | "master_admin" | "member";

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
