import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User } from "@/lib/types/database";
import { ProfilePageClient } from "@/components/profile-page-client";

export default async function ProfilePage() {
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

  return <ProfilePageClient profile={profile} />;
}
