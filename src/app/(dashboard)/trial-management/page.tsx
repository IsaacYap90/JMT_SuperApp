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
    />
  );
}
