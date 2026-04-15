import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import { isAdmin } from "@/lib/types/database";
import { PtLogForm } from "@/components/pt-log-form";

export const dynamic = "force-dynamic";

export default async function PtLogPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/pt/log/${params.id}`);

  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  const db = createAdminClient();
  const { data: session } = await db
    .from("pt_sessions")
    .select(
      "id, coach_id, scheduled_at, duration_minutes, status, coach_notes, next_focus, member:users!pt_sessions_member_id_fkey(full_name)"
    )
    .eq("id", params.id)
    .single();

  if (!session) notFound();

  const isOwner = session.coach_id === user.id;
  const admin = isAdmin(profile.role as "admin" | "master_admin" | "coach" | "member");
  if (!isOwner && !admin) redirect("/");

  const raw = session as unknown as {
    id: string;
    scheduled_at: string;
    duration_minutes: number;
    status: string;
    coach_notes: string | null;
    next_focus: string | null;
    member: { full_name: string } | { full_name: string }[] | null;
  };
  const member = Array.isArray(raw.member) ? raw.member[0] : raw.member;
  const memberName = member?.full_name || "Client";

  const dt = new Date(raw.scheduled_at);
  const dateLabel = dt.toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });
  const timeLabel = dt.toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Singapore",
  });

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div>
        <p className="text-xs text-jai-text/60 uppercase tracking-wider">PT session log</p>
        <h1 className="text-xl font-bold mt-1">{memberName}</h1>
        <p className="text-sm text-jai-text mt-0.5">
          {dateLabel} · {timeLabel} · {raw.duration_minutes}min
        </p>
      </div>

      <PtLogForm
        sessionId={raw.id}
        initialCoachNotes={raw.coach_notes || ""}
        initialNextFocus={raw.next_focus || ""}
      />
    </div>
  );
}
