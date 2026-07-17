import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User } from "@/lib/types/database";
import MetaClient from "./MetaClient";

// JAI Meta assistant — FB/IG comment inbox + activity. master_admin (Jeremy) only.
export default async function MetaPage() {
  const supabase = await createClient();
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

  if (profile.role !== "master_admin") redirect("/");

  return <MetaClient />;
}
