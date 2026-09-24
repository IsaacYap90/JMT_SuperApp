import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CalendarManageClient } from "@/components/calendar-manage-client";

export const dynamic = "force-dynamic";

export default async function CalendarManagePage({ searchParams }: { searchParams: Promise<{ draft?: string; class?: string; pt?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("role, is_active").eq("id", user.id).single();
  if (!profile?.is_active || (profile.role !== "master_admin" && !(profile.role === "coach" && params.pt))) redirect("/");

  const db = createAdminClient();
  if (params.pt) {
    let query = db.from("pt_sessions").select("id, coach_id, scheduled_at, duration_minutes, status, member:users!pt_sessions_member_id_fkey(full_name)").eq("id", params.pt);
    if (profile.role !== "master_admin") query = query.eq("coach_id", user.id);
    const { data: session, error } = await query.maybeSingle();
    if (error) throw new Error("Could not load PT session");
    const { data: ptCoaches } = profile.role === "master_admin"
      ? await db.from("users").select("id, full_name").in("role", ["coach", "master_admin"]).eq("is_active", true).order("full_name")
      : { data: [] };
    const member = session && (Array.isArray(session.member) ? session.member[0] : session.member);
    return <CalendarManageClient draft={null} classItem={null} members={[]} coaches={ptCoaches || []} canReassign={profile.role === "master_admin"} pt={session ? { id: session.id, coachId: session.coach_id, scheduledAt: session.scheduled_at, durationMinutes: session.duration_minutes, status: session.status, clientName: member?.full_name || "Client" } : null} />;
  }
  const [membersRes, coachesRes] = await Promise.all([
    db.from("users").select("id, full_name").eq("role", "member").eq("is_active", true).is("merged_into_id", null).order("full_name"),
    db.from("users").select("id, full_name").in("role", ["coach", "admin", "master_admin"]).eq("is_active", true).is("merged_into_id", null).order("full_name"),
  ]);
  const members = (membersRes.data || []) as { id: string; full_name: string }[];
  const coaches = (coachesRes.data || []) as { id: string; full_name: string }[];

  let draft: { id: string; summary: string; scheduledAt: string; durationMinutes: number } | null = null;
  if (params.draft) {
    const { data } = await db.from("gcal_pt_drafts").select("id, summary, scheduled_at, duration_minutes").eq("id", params.draft).eq("status", "pending").maybeSingle();
    if (data) draft = { id: data.id, summary: data.summary, scheduledAt: data.scheduled_at, durationMinutes: data.duration_minutes };
  }

  let classItem: { id: string; name: string; assignedCoachIds: string[] } | null = null;
  if (params.class) {
    const [{ data: cls }, { data: links }] = await Promise.all([
      db.from("classes").select("id, name, lead_coach_id, assistant_coach_id").eq("id", params.class).eq("is_active", true).maybeSingle(),
      db.from("class_coaches").select("coach_id").eq("class_id", params.class),
    ]);
    if (cls) classItem = { id: cls.id, name: cls.name, assignedCoachIds: Array.from(new Set([cls.lead_coach_id, cls.assistant_coach_id, ...(links || []).map((row) => row.coach_id)].filter(Boolean) as string[])) };
  }

  return <CalendarManageClient draft={draft} classItem={classItem} members={members} coaches={coaches} />;
}
