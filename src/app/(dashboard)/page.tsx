import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { CoachDashboard } from "@/components/coach-dashboard";
import { Class, User, PtSession, isAdmin } from "@/lib/types/database";

export const dynamic = "force-dynamic";

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

  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Singapore" })
    .toLowerCase();
  const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const tomorrowDate = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

  if (isAdmin(profile.role)) {
    const db = createAdminClient();
    const dayAfterTomorrowDate = new Date(Date.now() + 2 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const tomorrowDay = new Date(Date.now() + 86400000)
      .toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Singapore" })
      .toLowerCase();

    const [classesRes, ptPackagesRes, ptSessionsRes, leavesRes, coachesRes, tomorrowPtRes] =
      await Promise.all([
        db
          .from("classes")
          .select(CLASS_SELECT)
          .eq("is_active", true)
          .order("start_time"),
        db
          .from("pt_packages")
          .select("id, status, sessions_used, total_sessions")
          .eq("status", "active"),
        db
          .from("pt_sessions")
          .select(
            "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*), package:pt_packages(guardian_name, guardian_phone)"
          )
          .gte("scheduled_at", todayDate)
          .lt("scheduled_at", tomorrowDate)
          .in("status", ["scheduled", "confirmed", "completed"])
          .order("scheduled_at"),
        db
          .from("leaves")
          .select("id")
          .eq("status", "pending"),
        db
          .from("users")
          .select("*")
          .in("role", ["coach", "admin", "master_admin"])
          .eq("is_active", true)
          .order("full_name"),
        db
          .from("pt_sessions")
          .select(
            "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*), package:pt_packages(guardian_name, guardian_phone)"
          )
          .gte("scheduled_at", tomorrowDate)
          .lt("scheduled_at", dayAfterTomorrowDate)
          .in("status", ["scheduled", "confirmed"])
          .order("scheduled_at"),
      ]);

    const allClasses = (classesRes.data || []) as unknown as Class[];
    const todayClasses = allClasses.filter((c) => c.day_of_week === today);
    const tomorrowClasses = allClasses.filter((c) => c.day_of_week === tomorrowDay);
    const todayPtSessions = (ptSessionsRes.data || []) as unknown as PtSession[];
    const tomorrowPtSessions = (tomorrowPtRes.data || []) as unknown as PtSession[];

    const activePtPackages = (ptPackagesRes.data || []).filter(
      (pt: { sessions_used: number; total_sessions: number }) => pt.sessions_used < pt.total_sessions
    ).length;

    const pendingLeaves = (leavesRes.data || []).length;

    return (
      <AdminDashboard
        todayClasses={todayClasses}
        todayPtSessions={todayPtSessions}
        tomorrowClasses={tomorrowClasses}
        tomorrowPtSessions={tomorrowPtSessions}
        activePtPackages={activePtPackages}
        pendingLeaves={pendingLeaves}
        today={today}
        userName={profile.full_name}
        coaches={(coachesRes.data || []) as unknown as User[]}
      />
    );
  }

  // Coach view — compute week range (Mon–Sun)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const mondayDate = monday.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  const sundayDate = sunday.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const nextSunday = new Date(monday);
  nextSunday.setDate(monday.getDate() + 14);
  const nextSundayDate = nextSunday.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

  const [classesRes, classCoachesRes, todayPtRes, weekPtRes, nextWeekPtRes] = await Promise.all([
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
      .from("pt_sessions")
      .select("*, member:users!pt_sessions_member_id_fkey(*), package:pt_packages(guardian_name, guardian_phone)")
      .eq("coach_id", user.id)
      .gte("scheduled_at", todayDate)
      .lt("scheduled_at", tomorrowDate)
      .in("status", ["scheduled", "confirmed", "completed"])
      .order("scheduled_at"),
    supabase
      .from("pt_sessions")
      .select("id, duration_minutes, status")
      .eq("coach_id", user.id)
      .gte("scheduled_at", mondayDate)
      .lt("scheduled_at", sundayDate),
    supabase
      .from("pt_sessions")
      .select("*, member:users!pt_sessions_member_id_fkey(*), package:pt_packages(guardian_name, guardian_phone)")
      .eq("coach_id", user.id)
      .gte("scheduled_at", sundayDate)
      .lt("scheduled_at", nextSundayDate)
      .order("scheduled_at"),
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

  const todayClasses = myClasses.filter((c) => c.day_of_week === today);
  const todayPtSessions = (todayPtRes.data || []) as unknown as PtSession[];
  const weekPtData = (weekPtRes.data || []) as { id: string; duration_minutes: number; status: string }[];
  const weekPtCount = weekPtData.length;
  const weekPtHours = weekPtData.reduce((sum, s) => sum + (s.duration_minutes || 60) / 60, 0);
  const weekPtStats = {
    scheduled: weekPtData.filter((s) => s.status === "scheduled" || s.status === "confirmed").length,
    completed: weekPtData.filter((s) => s.status === "completed").length,
    cancelled: weekPtData.filter((s) => s.status === "cancelled").length,
    noShow: weekPtData.filter((s) => s.status === "no_show").length,
  };
  const nextWeekPtSessions = (nextWeekPtRes.data || []) as unknown as PtSession[];

  // Tomorrow's data
  const tomorrow = new Date(Date.now() + 86400000)
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Singapore" })
    .toLowerCase();
  const dayAfterTomorrowDate = new Date(Date.now() + 2 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  const tomorrowClasses = myClasses.filter((c) => c.day_of_week === tomorrow);

  const { data: tomorrowPtData } = await supabase
    .from("pt_sessions")
    .select("*, member:users!pt_sessions_member_id_fkey(*)")
    .eq("coach_id", user.id)
    .gte("scheduled_at", tomorrowDate)
    .lt("scheduled_at", dayAfterTomorrowDate)
    .in("status", ["scheduled", "confirmed"])
    .order("scheduled_at");

  const tomorrowPtSessions = (tomorrowPtData || []) as unknown as PtSession[];

  return (
    <CoachDashboard
      todayClasses={todayClasses}
      todayPtSessions={todayPtSessions}
      tomorrowClasses={tomorrowClasses}
      tomorrowPtSessions={tomorrowPtSessions}
      weekClasses={myClasses}
      weekPtCount={weekPtCount}
      weekPtHours={weekPtHours}
      weekPtStats={weekPtStats}
      nextWeekPtSessions={nextWeekPtSessions}
      coachName={profile.full_name}
      today={today}
    />
  );
}
