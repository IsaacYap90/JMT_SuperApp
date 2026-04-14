import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User, Leave, isAdmin } from "@/lib/types/database";
import { LeavePageClient } from "@/components/leave-page-client";

export default async function LeavePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profileData) redirect("/login");
  const profile = profileData as unknown as User;

  // Admin view shows leaves for full-time coaches only. Part-time coach leave
  // history is hidden from the tab entirely (Jeremy doesn't track their leaves).
  // Coach view always sees only their own leaves regardless of employment type.
  let query = supabase
    .from("leaves")
    .select("*, coach:users!leaves_coach_id_fkey!inner(*), reviewer:users!leaves_reviewed_by_fkey(*)")
    .order("leave_date", { ascending: false });

  if (!isAdmin(profile.role)) {
    query = query.eq("coach_id", user.id);
  } else {
    query = query.eq("coach.employment_type", "full_time");
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch leaves:", error.message, error.details);
  }
  const leaves = (data || []) as unknown as Leave[];

  // Admins see balances for ALL coaches instead of their own. Fetch the
  // coach roster so the client can render one card per coach. Excludes the
  // logged-in admin themselves (Jeremy explicitly doesn't want to see his own).
  let coaches: Pick<User, "id" | "full_name" | "role">[] = [];
  let inLieuCredits: { coach_id: string; days: number }[] = [];

  // Always fetch OIL credits — coaches need their own balance, admins need all.
  const { data: creditData } = await supabase
    .from("in_lieu_credits")
    .select("coach_id, days");
  inLieuCredits = (creditData || []).map((c: { coach_id: string; days: number | string }) => ({
    coach_id: c.coach_id,
    days: Number(c.days),
  }));

  if (isAdmin(profile.role)) {
    const { data: coachData } = await supabase
      .from("users")
      .select("id, full_name, role")
      .in("role", ["coach", "admin", "master_admin"])
      .eq("is_active", true)
      .eq("employment_type", "full_time")
      .neq("id", user.id)
      .is("merged_into_id", null)
      .order("full_name");
    coaches = (coachData || []) as Pick<User, "id" | "full_name" | "role">[];
  }

  return (
    <LeavePageClient
      leaves={leaves}
      profile={profile}
      userId={user.id}
      coaches={coaches}
      inLieuCredits={inLieuCredits}
    />
  );
}
