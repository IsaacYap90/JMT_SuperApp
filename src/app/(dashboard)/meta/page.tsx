import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User } from "@/lib/types/database";
import MetaClient from "./MetaClient";
import { USER_SELECT } from "@/lib/user-columns";

// JAI Meta assistant — FB/IG comment inbox + activity. master_admin (Jeremy) only.
export default async function MetaPage() {
  const supabase = createClient();
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

  if (profile.role !== "master_admin") redirect("/");

  return <MetaClient />;
}
