import { createAdminClient } from "@/lib/supabase/admin";
import { FollowUpCard, FollowUpItem } from "@/components/follow-up-card";

// "Follow up" — the action list at the top of the admin dashboard: only things
// waiting on a human, each one tap to act, gone once handled. Server half
// gathers leads/trials/leaves; unread WhatsApp rows are added client-side by
// FollowUpCard (per-device read state lives in localStorage).
export async function FollowUp() {
  const db = createAdminClient();
  const since48h = new Date(Date.now() - 48 * 3600_000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const [newLeadsRes, noShowRes, leavesRes] = await Promise.all([
    db
      .from("leads")
      .select("id, name, source, created_at")
      .eq("status", "new")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("trial_bookings")
      .select("id, name, updated_at")
      .eq("status", "no_show")
      .gte("updated_at", since48h)
      .order("updated_at", { ascending: false })
      .limit(3),
    db
      .from("leaves")
      .select("id, coach:users!leaves_coach_id_fkey(full_name)")
      .eq("status", "pending")
      .is("deleted_at", null)
      .limit(5),
  ]);

  const items: FollowUpItem[] = [];

  for (const l of newLeadsRes.data || []) {
    items.push({
      id: `lead-${l.id}`,
      tone: "blue",
      label: "Contact new lead",
      detail: `${l.name}${l.source ? ` · ${l.source}` : ""}`,
      href: "/leads",
    });
  }

  for (const t of noShowRes.data || []) {
    items.push({
      id: `trial-${t.id}`,
      tone: "amber",
      label: "Follow up no-show trial",
      detail: t.name,
      href: "/trial-management",
    });
  }

  for (const lv of (leavesRes.data || []) as Array<{
    id: string;
    coach: { full_name: string } | { full_name: string }[] | null;
  }>) {
    const coach = Array.isArray(lv.coach) ? lv.coach[0] : lv.coach;
    items.push({
      id: `leave-${lv.id}`,
      tone: "amber",
      label: "Approve leave request",
      detail: coach?.full_name || "Coach",
      href: "/leave",
    });
  }

  return <FollowUpCard serverItems={items} />;
}
