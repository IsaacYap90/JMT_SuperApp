import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { User, isAdmin } from "@/lib/types/database";
import { TrialManagementClient } from "@/components/trial-management-client";

export default async function TrialManagementPage() {
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

  const { data: bookings } = await admin
    .from("trial_bookings")
    .select("*, class:classes(name, start_time, end_time)")
    .order("booking_date", { ascending: false });

  // Classes enabled for trial booking (for the manual-add dropdown)
  const { data: enabledSettings } = await admin
    .from("trial_settings")
    .select("class_id")
    .eq("is_trial_enabled", true);
  const enabledIds = (enabledSettings || []).map((s) => s.class_id);

  const { data: enabledClasses } = enabledIds.length
    ? await admin
        .from("classes")
        .select("id, name, day_of_week, start_time, end_time, programme, is_active")
        .in("id", enabledIds)
        .eq("is_active", true)
        .order("day_of_week")
        .order("start_time")
    : { data: [] };

  return (
    <TrialManagementClient
      bookings={(bookings || []) as {
        id: string;
        name: string;
        phone: string;
        programme: string;
        class_id: string;
        booking_date: string;
        time_slot: string;
        status: string;
        created_at: string;
        class: { name: string; start_time: string; end_time: string } | null;
      }[]}
      classes={(enabledClasses || []) as {
        id: string;
        name: string;
        day_of_week: string;
        start_time: string;
        end_time: string;
        programme: string | null;
      }[]}
    />
  );
}
