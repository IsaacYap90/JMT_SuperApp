import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { isAdmin, User } from "@/lib/types/database";
import { NewContractWizard } from "@/components/new-contract-wizard";

export const dynamic = "force-dynamic";

export default async function NewContractPage() {
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
  if (!isAdmin(profile.role)) redirect("/");

  const db = createAdminClient();
  const [membersRes, coachesRes] = await Promise.all([
    db
      .from("users")
      .select("*")
      .eq("role", "member")
      .eq("is_active", true)
      .order("full_name"),
    db
      .from("users")
      .select("*")
      .in("role", ["coach", "admin", "master_admin"])
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const members = (membersRes.data || []) as unknown as User[];
  const coaches = (coachesRes.data || []) as unknown as User[];

  return (
    <NewContractWizard
      members={members}
      coaches={coaches}
      defaultJmtRepName={profile.full_name || "Jai Muay Thai"}
    />
  );
}
