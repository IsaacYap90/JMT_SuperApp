import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { User, PtPackage, PtSession, isAdmin } from "@/lib/types/database";
import { PtPageClient } from "@/components/pt-page-client";
import type { ContractDraft } from "@/app/actions/pt";

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

  // Use admin client for admin users (bypasses RLS)
  const db = admin ? createAdminClient() : supabase;

  let pkgQuery = db
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
  let ptSessions: PtSession[] = [];

  if (admin) {
    // Admin: fetch PT sessions (7 days back + future)
    const ptPastDate = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const { data: sessData } = await db
      .from("pt_sessions")
      .select(
        "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*)"
      )
      .gte("scheduled_at", ptPastDate)
      .in("status", ["scheduled", "confirmed", "completed"])
      .order("scheduled_at");
    ptSessions = (sessData || []) as unknown as PtSession[];
  } else if (ptPackages.length > 0) {
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

  // Map package_id → latest contract_id (signed PT agreements)
  const contractsByPackage: Record<string, string> = {};
  if (ptPackages.length > 0) {
    const { data: contractRows } = await db
      .from("pt_contracts")
      .select("id, package_id, created_at")
      .in(
        "package_id",
        ptPackages.map((p) => p.id)
      )
      .order("created_at", { ascending: false });
    if (contractRows) {
      for (const row of contractRows as { id: string; package_id: string }[]) {
        if (!contractsByPackage[row.package_id]) {
          contractsByPackage[row.package_id] = row.id;
        }
      }
    }
  }

  // Fetch members, coaches, and contract drafts for admin forms
  let members: User[] = [];
  let coaches: User[] = [];
  let contractDrafts: ContractDraft[] = [];
  if (admin) {
    const [membersRes, coachesRes, draftsRes] = await Promise.all([
      db.from("users").select("*").eq("role", "member").eq("is_active", true).order("full_name"),
      db
        .from("users")
        .select("*")
        .in("role", ["coach", "admin", "master_admin"])
        .eq("is_active", true)
        .order("full_name"),
      db
        .from("pt_contract_drafts")
        .select("*")
        .eq("status", "draft")
        .order("created_at", { ascending: false }),
    ]);
    members = (membersRes.data || []) as unknown as User[];
    coaches = (coachesRes.data || []) as unknown as User[];
    contractDrafts = (draftsRes.data || []) as unknown as ContractDraft[];
  }

  return (
    <PtPageClient
      ptPackages={ptPackages}
      ptSessions={ptSessions}
      profile={profile}
      nextSessions={nextSessions}
      members={members}
      coaches={coaches}
      contractDrafts={contractDrafts}
      contractsByPackage={contractsByPackage}
    />
  );
}
