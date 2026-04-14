import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { User, isAdmin } from "@/lib/types/database";
import { LeadsPageClient } from "@/components/leads-page-client";
import type { Lead } from "@/app/actions/leads";

export default async function LeadsPage() {
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
  const { data: leadsData } = await db
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  const leads = (leadsData || []) as unknown as Lead[];

  return <LeadsPageClient leads={leads} isAdmin />;
}
