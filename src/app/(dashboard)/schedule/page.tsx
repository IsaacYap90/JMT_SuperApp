import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { CoachSchedule } from "@/components/coach-schedule";
import { SchedulePageClient } from "@/components/schedule-page-client";
import { Class, User, PtSession, isAdmin } from "@/lib/types/database";
import { fetchPreviousFocusMap, attachPreviousFocusToNext } from "@/lib/pt-focus";

export const dynamic = "force-dynamic";

const CLASS_SELECT =
  "*, lead_coach:users!classes_lead_coach_id_fkey(*), assistant_coach:users!classes_assistant_coach_id_fkey(*), class_coaches(*, coach:users(*))";

// Resolve anchor date from ?date=YYYY-MM-DD in SGT, default to today.
function resolveAnchorDate(raw?: string): string {
  const todaySgt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const todayIso = `${todaySgt.getFullYear()}-${String(todaySgt.getMonth() + 1).padStart(2, "0")}-${String(todaySgt.getDate()).padStart(2, "0")}`;
  if (!raw) return todayIso;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIso;
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const anchorDate = resolveAnchorDate(searchParams.date);
  const rangeStart = shiftIsoDate(anchorDate, -14);
  const rangeEnd = shiftIsoDate(anchorDate, 21);
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
        .is("merged_into_id", null)
        .order("full_name"),
      db
        .from("pt_sessions")
        .select(
          "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*), package:pt_packages(guardian_name, guardian_phone)"
        )
        .gte("scheduled_at", rangeStart)
        .lte("scheduled_at", `${rangeEnd}T23:59:59+08:00`)
        .in("status", ["scheduled", "confirmed", "completed", "cancelled", "no_show"])
        .order("scheduled_at"),
    ]);

    const rawPtSessions = (ptSessionsRes.data || []) as unknown as PtSession[];
    const adminFocusMap = await fetchPreviousFocusMap(
      db,
      rawPtSessions.map((s) => s.member_id)
    );
    const ptSessions = attachPreviousFocusToNext(rawPtSessions, adminFocusMap);

    return (
      <SchedulePageClient
        classes={(classesRes.data || []) as unknown as Class[]}
        coaches={(coachesRes.data || []) as unknown as User[]}
        ptSessions={ptSessions}
        isAdmin={true}
        adminId={user.id}
        anchorDate={anchorDate}
      />
    );
  }

  // Coach view: window centered on anchor date.
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
      .select("*, member:users!pt_sessions_member_id_fkey(*), package:pt_packages(guardian_name, guardian_phone)")
      .eq("coach_id", user.id)
      .gte("scheduled_at", rangeStart)
      .lte("scheduled_at", `${rangeEnd}T23:59:59+08:00`)
      .in("status", ["scheduled", "confirmed", "completed", "cancelled", "no_show"])
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

  const rawPtSessions = (ptSessionsRes.data || []) as unknown as PtSession[];
  const coachFocusMap = await fetchPreviousFocusMap(
    supabase,
    rawPtSessions.map((s) => s.member_id)
  );
  const ptSessions = attachPreviousFocusToNext(rawPtSessions, coachFocusMap);

  return <CoachSchedule classes={myClasses} ptSessions={ptSessions} showFilter coachId={user.id} anchorDate={anchorDate} />;
}
