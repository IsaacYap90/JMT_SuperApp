import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User } from "@/lib/types/database";
import WaInboxClient from "./WaInboxClient";
import { USER_SELECT } from "@/lib/user-columns";
import { DEMO_MODE } from "@/lib/demo-mask";

// Native WhatsApp inbox — master_admin (Jeremy) only.
export default async function WaInboxPage() {
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

  // Demo filming flag is read on the SERVER (process.env is always reliable here)
  // and passed down, rather than relying on a NEXT_PUBLIC_ var reaching the browser.
  // Sourced from demo-mask so the production hard-lock applies here too — this is
  // the one place that REPLACES the inbox with a fixture, so it must never fire
  // on jmtos.ionicx.ai even if the flag is set.
  return <WaInboxClient demo={DEMO_MODE} />;
}
