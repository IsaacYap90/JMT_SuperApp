import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import { User, PtPackage, PtSession, isAdmin } from "@/lib/types/database";
import { PtClientHistory } from "@/components/pt-client-history";

export const dynamic = "force-dynamic";

export default async function PtClientPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/pt/client/${params.id}`);

  const { data: profileData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profileData) redirect("/login");
  const profile = profileData as unknown as User;
  const admin = isAdmin(profile.role);

  // Coaches can only view clients assigned to them.
  // Admins see anyone.
  const db = admin ? createAdminClient() : supabase;

  const { data: memberData } = await db
    .from("users")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!memberData) notFound();
  const member = memberData as unknown as User;

  // Authorization: coach must have at least one PT package or session with this member.
  if (!admin) {
    const { count } = await supabase
      .from("pt_packages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", params.id)
      .eq("preferred_coach_id", user.id);
    if (!count) {
      const { count: sessCount } = await supabase
        .from("pt_sessions")
        .select("id", { count: "exact", head: true })
        .eq("member_id", params.id)
        .eq("coach_id", user.id);
      if (!sessCount) redirect("/pt");
    }
  }

  const [packagesRes, sessionsRes] = await Promise.all([
    db
      .from("pt_packages")
      .select("*, coach:users!pt_packages_preferred_coach_id_fkey(*)")
      .eq("user_id", params.id)
      .order("created_at", { ascending: false }),
    db
      .from("pt_sessions")
      .select("*, coach:users!pt_sessions_coach_id_fkey(*)")
      .eq("member_id", params.id)
      .order("scheduled_at", { ascending: false }),
  ]);

  const packages = (packagesRes.data || []) as unknown as PtPackage[];
  const sessions = (sessionsRes.data || []) as unknown as PtSession[];

  return (
    <PtClientHistory
      member={member}
      packages={packages}
      sessions={sessions}
      isAdmin={admin}
    />
  );
}
