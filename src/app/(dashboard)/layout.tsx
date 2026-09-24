import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { buildCommandIndex } from "@/lib/command-index";
import { User } from "@/lib/types/database";
import { USER_SELECT } from "@/lib/user-columns";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("users")
    .select(USER_SELECT)
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
    <div className="flex min-h-[100dvh] bg-jai-bg">
      <Sidebar profile={profile} />
      {/* 🛑 min-w-0 is load-bearing. A flex child defaults to min-width:auto, so
          without it <main> cannot shrink below its content's intrinsic width and
          any wide child pushes the WHOLE PAGE past the viewport — which is why
          the WA inbox thread and its message bubbles were cut off on the right
          on a phone, and why the contact's phone number never appeared (Jeremy,
          14 Sep 2026). The same fix is already documented on the thread section
          in WaInboxClient.tsx; it was never applied to the shell above it, so
          every dashboard page shares the hazard, not just the inbox. */}
      <main className="flex-1 min-w-0 px-4 pt-14 pb-24 md:px-6 lg:px-8 overflow-auto">
        {children}
      </main>
      <CommandPalette index={commandIndex} />
    </div>
  );
}
