import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User } from "@/lib/types/database";
import { EarningClient } from "@/components/earning-client";

export default async function EarningPage() {
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

  // Only Isaac can access this page
  if (profile.full_name !== "Isaac Yap") redirect("/");

  // Fetch earnings
  const { data: earningsData } = await supabase
    .from("earnings")
    .select("*")
    .eq("coach_id", user.id)
    .order("date", { ascending: false });

  return (
    <EarningClient
      earnings={earningsData || []}
      coachId={user.id}
    />
  );
}
