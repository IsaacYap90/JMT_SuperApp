import { createClient } from "@/lib/supabase/server";

// The WhatsApp inbox is master_admin (Jeremy) only. Used by the /api/wa-inbox/* routes.
export async function isMasterAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  return (data as { role?: string } | null)?.role === "master_admin";
}
