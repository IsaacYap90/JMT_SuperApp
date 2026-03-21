import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SchedulePageClient } from "@/components/schedule-page-client";
import { Class, User, isAdmin } from "@/lib/types/database";

const CLASS_SELECT =
  "*, lead_coach:users!classes_lead_coach_id_fkey(*), assistant_coach:users!classes_assistant_coach_id_fkey(*), class_coaches(*, coach:users(*))";

export default async function SchedulePage() {
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

  const { data: classes } = await supabase
    .from("classes")
    .select(CLASS_SELECT)
    .eq("is_active", true)
    .order("start_time");

  const { data: coachesRaw } = await supabase
    .from("users")
    .select("*")
    .in("role", ["coach", "admin", "master_admin"])
    .eq("is_active", true)
    .order("full_name");

  // Deduplicate by full_name
  const allCoaches = (coachesRaw || []) as unknown as User[];
  const seen = new Set<string>();
  const coaches = allCoaches.filter((c) => {
    if (seen.has(c.full_name)) return false;
    seen.add(c.full_name);
    return true;
  });

  return (
    <SchedulePageClient
      classes={(classes || []) as unknown as Class[]}
      coaches={coaches}
      isAdmin={isAdmin(profile.role)}
    />
  );
}
