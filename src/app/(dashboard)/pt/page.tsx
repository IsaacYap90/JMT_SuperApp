import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User, PtPackage, isAdmin } from "@/lib/types/database";
import { PtPageClient } from "@/components/pt-page-client";

export default async function PtPage() {
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
  const admin = isAdmin(profile.role);

  let pkgQuery = supabase
    .from("pt_packages")
    .select(
      "*, member:users!pt_packages_user_id_fkey(*), coach:users!pt_packages_preferred_coach_id_fkey(*)"
    )
    .order("created_at", { ascending: false });

  if (!admin) {
    pkgQuery = pkgQuery.eq("preferred_coach_id", user.id);
  }

  const { data: pkgData } = await pkgQuery;
  const ptPackages = (pkgData || []) as unknown as PtPackage[];

  // Fetch next sessions for coach view
  const nextSessions: Record<string, string> = {};
  if (!admin && ptPackages.length > 0) {
    const memberIds = ptPackages.map((p) => p.user_id);
    const { data: sessData } = await supabase
      .from("pt_sessions")
      .select("member_id, scheduled_at")
      .eq("coach_id", user.id)
      .in("member_id", memberIds)
      .gte("scheduled_at", new Date().toISOString().split("T")[0])
      .in("status", ["scheduled", "confirmed"])
      .order("scheduled_at");
    if (sessData) {
      for (const s of sessData as { member_id: string; scheduled_at: string }[]) {
        if (!nextSessions[s.member_id]) {
          nextSessions[s.member_id] = s.scheduled_at;
        }
      }
    }
  }

  // Fetch members and coaches for admin add/edit form
  let members: User[] = [];
  let coaches: User[] = [];
  if (admin) {
    const [membersRes, coachesRes] = await Promise.all([
      supabase.from("users").select("*").eq("is_active", true).order("full_name"),
      supabase
        .from("users")
        .select("*")
        .in("role", ["coach", "admin", "master_admin"])
        .eq("is_active", true)
        .order("full_name"),
    ]);
    members = (membersRes.data || []) as unknown as User[];
    coaches = (coachesRes.data || []) as unknown as User[];
  }

  return (
    <PtPageClient
      ptPackages={ptPackages}
      profile={profile}
      nextSessions={nextSessions}
      members={members}
      coaches={coaches}
    />
  );
}
