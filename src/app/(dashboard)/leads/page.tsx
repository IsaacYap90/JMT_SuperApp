import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { User, isAdmin } from "@/lib/types/database";
import { LeadsPageClient } from "@/components/leads-page-client";
import type { Lead } from "@/app/actions/leads";
import { USER_SELECT } from "@/lib/user-columns";
import { DEMO_MODE, maskName, maskPhone, maskEmail, scrubText, maskFormFields } from "@/lib/demo-mask";

export default async function LeadsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("users")
    .select(USER_SELECT)
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

  const rawLeads = (leadsData || []) as unknown as Lead[];
  // Display-only PII mask (env-gated). Seeded by lead id so the same lead shows
  // the same fake here, in the activity feed, and in follow-ups.
  const leads = DEMO_MODE
    ? rawLeads.map((l) => ({
        ...l,
        name: maskName(l.name, l.id),
        phone: maskPhone(l.phone, l.id),
        email: maskEmail(l.email, l.id),
        notes: scrubText(l.notes),
        form_fields: maskFormFields(l.form_fields, l.id) ?? null,
      }))
    : rawLeads;

  return <LeadsPageClient leads={leads} isAdmin />;
}
