import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { CoachDashboard } from "@/components/coach-dashboard";
import { Class, User, PtPackage, PtSession, isAdmin } from "@/lib/types/database";

const CLASS_SELECT =
  "*, lead_coach:users!classes_lead_coach_id_fkey(*), assistant_coach:users!classes_assistant_coach_id_fkey(*), class_coaches(*, coach:users(*))";

export default async function HomePage() {
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

  if (isAdmin(profile.role)) {
    const today = new Date()
      .toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Singapore" })
      .toLowerCase();

    const [classesRes, ptPackagesRes, ptSessionsRes, coachesRes, leavesRes] =
      await Promise.all([
        supabase
          .from("classes")
          .select(CLASS_SELECT)
          .eq("is_active", true)
          .order("start_time"),
        supabase
          .from("pt_packages")
          .select(
            "*, member:users!pt_packages_user_id_fkey(*), coach:users!pt_packages_preferred_coach_id_fkey(*)"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("pt_sessions")
          .select(
            "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*)"
          )
          .gte("scheduled_at", new Date().toISOString().split("T")[0])
          .order("scheduled_at"),
        supabase
          .from("users")
          .select("*")
          .in("role", ["coach", "admin", "master_admin"])
          .eq("is_active", true)
          .order("full_name"),
        supabase
          .from("leaves")
          .select("id")
          .eq("status", "pending"),
      ]);

    const classes = (classesRes.data || []) as unknown as Class[];
    const ptPackages = (ptPackagesRes.data || []) as unknown as PtPackage[];
    const ptSessions = (ptSessionsRes.data || []) as unknown as PtSession[];
    // Deduplicate coaches by full_name (keep first occurrence)
    const allCoaches = (coachesRes.data || []) as unknown as User[];
    const seen = new Set<string>();
    const coaches = allCoaches.filter((c) => {
      if (seen.has(c.full_name)) return false;
      seen.add(c.full_name);
      return true;
    });

    const activePtPackages = ptPackages.filter(
      (pt) => pt.status === "active" && pt.sessions_used < pt.total_sessions
    );

    const pendingLeaves = (leavesRes.data || []).length;

    return (
      <AdminDashboard
        allClasses={classes}
        ptPackages={ptPackages}
        ptSessions={ptSessions}
        coaches={coaches}
        activePtPackages={activePtPackages.length}
        pendingLeaves={pendingLeaves}
        today={today}
        userName={profile.full_name}
      />
    );
  }

  // Coach view — show classes where coach is lead, assistant, or in class_coaches
  const [classesRes, classCoachesRes, ptPackagesRes] = await Promise.all([
    supabase
      .from("classes")
      .select(CLASS_SELECT)
      .eq("is_active", true)
      .order("start_time"),
    supabase
      .from("class_coaches")
      .select("class_id")
      .eq("coach_id", user.id),
    supabase
      .from("pt_packages")
      .select("*, member:users!pt_packages_user_id_fkey(*)")
      .eq("preferred_coach_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ]);

  const allClasses = (classesRes.data || []) as unknown as Class[];
  const classCoachClassIds = new Set(
    (classCoachesRes.data || []).map((cc: { class_id: string }) => cc.class_id)
  );

  const myClasses = allClasses.filter(
    (c) =>
      c.lead_coach_id === user.id ||
      c.assistant_coach_id === user.id ||
      classCoachClassIds.has(c.id)
  );

  const ptPkgs = (ptPackagesRes.data || []) as unknown as PtPackage[];

  // Fetch next sessions for each PT client
  const nextSessions: Record<string, string> = {};
  if (ptPkgs.length > 0) {
    const memberIds = ptPkgs.map((p) => p.user_id);
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

  return (
    <CoachDashboard
      classes={myClasses}
      ptPackages={ptPkgs}
      coachName={profile.full_name}
      nextSessions={nextSessions}
    />
  );
}
