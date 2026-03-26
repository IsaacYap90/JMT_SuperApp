import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { CoachSchedule } from "@/components/coach-schedule";
import { SchedulePageClient } from "@/components/schedule-page-client";
import { Class, User, PtSession, isAdmin } from "@/lib/types/database";

export const dynamic = "force-dynamic";

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

  if (isAdmin(profile.role)) {
    const db = createAdminClient();
    const pastDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const [classesRes, coachesRes, ptSessionsRes] = await Promise.all([
      db
        .from("classes")
        .select(CLASS_SELECT)
        .eq("is_active", true)
        .order("start_time"),
      db
        .from("users")
        .select("*")
        .in("role", ["coach", "admin", "master_admin"])
        .eq("is_active", true)
        .order("full_name"),
      db
        .from("pt_sessions")
        .select(
          "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*)"
        )
        .gte("scheduled_at", pastDate)
        .in("status", ["scheduled", "confirmed", "completed"])
        .order("scheduled_at"),
    ]);

    return (
      <SchedulePageClient
        classes={(classesRes.data || []) as unknown as Class[]}
        coaches={(coachesRes.data || []) as unknown as User[]}
        ptSessions={(ptSessionsRes.data || []) as unknown as PtSession[]}
        isAdmin={true}
      />
    );
  }

  // Coach view: fetch classes + PT sessions (7 days back + 14 days forward)
  const pastDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const [classesRes, classCoachesRes, ptSessionsRes] = await Promise.all([
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
      .select("*, member:users!pt_sessions_member_id_fkey(*)")
      .eq("coach_id", user.id)
      .gte("scheduled_at", pastDate)
      .in("status", ["scheduled", "confirmed", "completed"])
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

  const ptSessions = (ptSessionsRes.data || []) as unknown as PtSession[];

  return <CoachSchedule classes={myClasses} ptSessions={ptSessions} showFilter />;
}
