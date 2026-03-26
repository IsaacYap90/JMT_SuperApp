import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { User, isAdmin } from "@/lib/types/database";
import { TrialSettingsClient } from "@/components/trial-settings-client";

export default async function TrialSettingsPage() {
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

  const admin = createAdminClient();

  // Fetch all active classes with trial settings
  const { data: classes } = await admin
    .from("classes")
    .select("id, name, day_of_week, start_time, end_time, programme")
    .eq("is_active", true)
    .order("programme")
    .order("name")
    .order("day_of_week");

  const { data: settings } = await admin
    .from("trial_settings")
    .select("*");

  const settingsMap: Record<string, { is_trial_enabled: boolean; max_trial_spots: number }> = {};
  for (const s of settings || []) {
    settingsMap[s.class_id] = {
      is_trial_enabled: s.is_trial_enabled,
      max_trial_spots: s.max_trial_spots,
    };
  }

  return (
    <TrialSettingsClient
      classes={(classes || []) as { id: string; name: string; day_of_week: string; start_time: string; end_time: string; programme: string | null }[]}
      settingsMap={settingsMap}
    />
  );
}
