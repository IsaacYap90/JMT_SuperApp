import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { buildCommandIndex } from "@/lib/command-index";
import { User } from "@/lib/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profileData) {
    redirect("/login");
  }

  const profile = profileData as unknown as User;

  if (profile.is_first_login) {
    redirect("/change-password");
  }

  const commandIndex = await buildCommandIndex(profile);

  return (
    <div className="flex min-h-screen bg-jai-bg">
      <Sidebar profile={profile} />
      <main className="flex-1 px-4 pt-14 pb-24 md:px-6 lg:px-8 overflow-auto">
        {children}
      </main>
      <CommandPalette index={commandIndex} />
    </div>
  );
}
