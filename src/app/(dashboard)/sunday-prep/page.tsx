import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { User, PtSession, PtConfirmation, isAdmin } from "@/lib/types/database";
import { SundayPrepClient } from "@/components/sunday-prep-client";

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  // Monday of the coming week
  const daysUntilMon = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMon);
  monday.setHours(0, 0, 0, 0);
  // Saturday of the coming week
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  saturday.setHours(23, 59, 59, 999);

  return {
    weekStart: monday.toISOString().split("T")[0],
    mondayISO: monday.toISOString(),
    saturdayISO: saturday.toISOString(),
    mondayLabel: monday.toLocaleDateString("en-SG", { day: "numeric", month: "short" }),
    saturdayLabel: saturday.toLocaleDateString("en-SG", { day: "numeric", month: "short" }),
  };
}

export default async function SundayPrepPage() {
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

  if (!isAdmin(profile.role)) redirect("/");

  const { weekStart, mondayISO, saturdayISO, mondayLabel, saturdayLabel } = getWeekRange();

  // Last week's date range for stats
  const lastWeekMonday = new Date(mondayISO);
  lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);
  const lastWeekStart = lastWeekMonday.toISOString().split("T")[0];

  // Fetch PT sessions for the coming week
  const { data: sessionsData } = await supabase
    .from("pt_sessions")
    .select(
      "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*)"
    )
    .gte("scheduled_at", mondayISO)
    .lte("scheduled_at", saturdayISO)
    .in("status", ["scheduled", "confirmed"])
    .order("scheduled_at");

  const sessions = (sessionsData || []) as unknown as PtSession[];

  // Fetch existing confirmations for this week
  const sessionIds = sessions.map((s) => s.id);
  let confirmations: PtConfirmation[] = [];
  if (sessionIds.length > 0) {
    const { data: confData } = await supabase
      .from("pt_confirmations")
      .select("*")
      .eq("week_start", weekStart)
      .in("pt_session_id", sessionIds);
    confirmations = (confData || []) as unknown as PtConfirmation[];
  }

  // Fetch last week's confirmations for stats
  const { data: lastWeekData } = await supabase
    .from("pt_confirmations")
    .select("status")
    .eq("week_start", lastWeekStart);
  const lastWeekConfs = (lastWeekData || []) as { status: string }[];
  const lastWeekStats = {
    total: lastWeekConfs.length,
    sent: lastWeekConfs.filter((c) => c.status === "sent" || c.status === "replied").length,
    replied: lastWeekConfs.filter((c) => c.status === "replied").length,
  };

  return (
    <SundayPrepClient
      sessions={sessions}
      confirmations={confirmations}
      weekStart={weekStart}
      weekLabel={`${mondayLabel} – ${saturdayLabel}`}
      lastWeekStats={lastWeekStats}
    />
  );
}
