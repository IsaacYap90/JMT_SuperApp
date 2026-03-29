import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
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

  return (
    <div className="flex min-h-screen bg-jai-bg">
      <Sidebar profile={profile} />
      <main className="flex-1 px-4 pt-4 pb-24 md:px-6 md:pt-6 lg:px-8 lg:pt-8 lg:pb-8 overflow-auto ml-0 lg:ml-64">
        {children}
      </main>
    </div>
  );
}
