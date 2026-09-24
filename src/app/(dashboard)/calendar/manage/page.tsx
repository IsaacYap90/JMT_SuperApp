import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CalendarManageClient } from "@/components/calendar-manage-client";

export const dynamic = "force-dynamic";

export default async function CalendarManagePage({ searchParams }: { searchParams: Promise<{ draft?: string; class?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "master_admin") redirect("/");

  const db = createAdminClient();
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
