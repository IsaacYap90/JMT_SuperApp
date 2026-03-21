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

  let query = supabase
    .from("leaves")
    .select("*, coach:users!leaves_coach_id_fkey(*), reviewer:users!leaves_reviewed_by_fkey(*)")
    .order("leave_date", { ascending: false });

  if (!isAdmin(profile.role)) {
    query = query.eq("coach_id", user.id);
  }

  const { data } = await query;
  const leaves = (data || []) as unknown as Leave[];

  return (
    <LeavePageClient
      leaves={leaves}
      profile={profile}
      userId={user.id}
    />
  );
}
