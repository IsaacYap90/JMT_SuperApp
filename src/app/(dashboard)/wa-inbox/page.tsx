import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User } from "@/lib/types/database";
import WaInboxClient from "./WaInboxClient";

// Native WhatsApp inbox — master_admin (Jeremy) only.
export default async function WaInboxPage() {
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

  if (profile.role !== "master_admin") redirect("/");

  return <WaInboxClient />;
}
