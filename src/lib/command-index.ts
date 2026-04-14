import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, User } from "@/lib/types/database";
import type { CommandItem } from "@/components/command-palette";

const ADMIN_NAV: CommandItem[] = [
  { id: "nav-home", kind: "nav", label: "Overview", hint: "Home", href: "/" },
  { id: "nav-schedule", kind: "nav", label: "Schedule", hint: "Classes grid", href: "/schedule" },
  { id: "nav-pt", kind: "nav", label: "PT Sessions", hint: "Personal training", href: "/pt" },
  { id: "nav-trials", kind: "nav", label: "Trials", hint: "Trial bookings", href: "/trial-management" },
  { id: "nav-leads", kind: "nav", label: "Leads", hint: "Meta Lead Ads", href: "/leads" },
  { id: "nav-leave", kind: "nav", label: "Leave", hint: "Coach leave", href: "/leave" },
  { id: "nav-sunday-prep", kind: "nav", label: "Sunday Prep", hint: "Weekly send", href: "/sunday-prep" },
  { id: "nav-profile", kind: "nav", label: "Profile", href: "/profile" },
];

const COACH_NAV: CommandItem[] = [
  { id: "nav-home", kind: "nav", label: "Overview", hint: "Home", href: "/" },
  { id: "nav-schedule", kind: "nav", label: "Schedule", hint: "Classes grid", href: "/schedule" },
  { id: "nav-leave", kind: "nav", label: "Leave", hint: "Request leave", href: "/leave" },
  { id: "nav-profile", kind: "nav", label: "Profile", href: "/profile" },
];

export async function buildCommandIndex(profile: User): Promise<CommandItem[]> {
  const admin = isAdmin(profile.role);
  const items: CommandItem[] = admin ? [...ADMIN_NAV] : [...COACH_NAV];
  if (profile.full_name === "Isaac Yap") {
    items.push({ id: "nav-earning", kind: "nav", label: "Earning", hint: "Payouts", href: "/earning" });
  }

  if (admin) {
    const db = createAdminClient();
    const [coachesRes, leadsRes, membersRes, classesRes] = await Promise.all([
      db
        .from("users")
        .select("id, full_name, role")
        .in("role", ["coach", "admin", "master_admin"])
        .eq("is_active", true)
        .order("full_name")
        .limit(50),
      db
        .from("leads")
        .select("id, name, phone, status")
        .order("updated_at", { ascending: false })
        .limit(40),
      db
        .from("users")
        .select("id, full_name")
        .eq("role", "member")
        .eq("is_active", true)
        .order("full_name")
        .limit(60),
      db
        .from("classes")
        .select("id, name, day_of_week, start_time")
        .eq("is_active", true)
        .order("start_time")
        .limit(60),
    ]);

    for (const c of (coachesRes.data || []) as { id: string; full_name: string; role: string }[]) {
      items.push({
        id: `coach-${c.id}`,
        kind: "coach",
        label: c.full_name,
        hint: c.role === "master_admin" ? "Admin" : c.role,
        href: `/schedule?coach=${c.id}`,
      });
    }
    for (const l of (leadsRes.data || []) as { id: string; name: string; phone: string | null; status: string }[]) {
      items.push({
        id: `lead-${l.id}`,
        kind: "lead",
        label: l.name,
        hint: `${l.status}${l.phone ? ` · ${l.phone}` : ""}`,
        href: `/leads#lead-${l.id}`,
      });
    }
    for (const m of (membersRes.data || []) as { id: string; full_name: string }[]) {
      items.push({
        id: `member-${m.id}`,
        kind: "member",
        label: m.full_name,
        hint: "Member",
        href: `/pt?member=${m.id}`,
      });
    }
    for (const cl of (classesRes.data || []) as { id: string; name: string; day_of_week: string; start_time: string }[]) {
      items.push({
        id: `class-${cl.id}`,
        kind: "class",
        label: cl.name,
        hint: `${cl.day_of_week} · ${(cl.start_time || "").slice(0, 5)}`,
        href: `/schedule#class-${cl.id}`,
      });
    }
  } else {
    const supabase = createClient();
    const classesRes = await supabase
      .from("classes")
      .select("id, name, day_of_week, start_time, lead_coach_id, assistant_coach_id")
      .eq("is_active", true)
      .order("start_time")
      .limit(60);
    for (const cl of (classesRes.data || []) as { id: string; name: string; day_of_week: string; start_time: string }[]) {
      items.push({
        id: `class-${cl.id}`,
        kind: "class",
        label: cl.name,
        hint: `${cl.day_of_week} · ${(cl.start_time || "").slice(0, 5)}`,
        href: `/schedule#class-${cl.id}`,
      });
    }
  }

  return items;
}
