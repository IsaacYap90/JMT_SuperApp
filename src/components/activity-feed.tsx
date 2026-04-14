import { createAdminClient } from "@/lib/supabase/admin";

type FeedItem = {
  id: string;
  kind: "lead" | "leave" | "pt" | "trial";
  label: string;
  detail: string;
  at: string;
  dotClass: string;
  href: string;
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export async function ActivityFeed({ limit = 6 }: { limit?: number }) {
  const db = createAdminClient();
  const sinceIso = new Date(Date.now() - 48 * 3600_000).toISOString();

  const [leadsRes, leavesRes, ptRes, trialsRes] = await Promise.all([
    db
      .from("leads")
      .select("id, name, status, source, created_at, updated_at")
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(limit),
    db
      .from("leaves")
      .select("id, status, reason, coach_id, updated_at, coach:users!leaves_coach_id_fkey(full_name)")
      .gte("updated_at", sinceIso)
      .neq("status", "pending")
      .order("updated_at", { ascending: false })
      .limit(limit),
    db
      .from("pt_sessions")
      .select("id, status, updated_at, member:users!pt_sessions_member_id_fkey(full_name)")
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(limit),
    db
      .from("trial_bookings")
      .select("id, name, status, updated_at, created_at")
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);

  const items: FeedItem[] = [];

  for (const l of leadsRes.data || []) {
    const isNew = l.status === "new" && (!l.updated_at || l.updated_at === l.created_at);
    items.push({
      id: `lead-${l.id}`,
      kind: "lead",
      label: isNew ? "New lead" : `Lead → ${l.status}`,
      detail: `${l.name}${l.source ? ` · ${l.source}` : ""}`,
      at: l.updated_at || l.created_at,
      dotClass: "bg-blue-400",
      href: "/leads",
    });
  }

  for (const lv of (leavesRes.data || []) as Array<{ id: string; status: string; reason: string; updated_at: string; coach: { full_name: string } | { full_name: string }[] | null }>) {
    const coach = Array.isArray(lv.coach) ? lv.coach[0] : lv.coach;
    items.push({
      id: `leave-${lv.id}`,
      kind: "leave",
      label: `Leave ${lv.status}`,
      detail: `${coach?.full_name || "Coach"}${lv.reason ? ` · ${lv.reason.slice(0, 40)}` : ""}`,
      at: lv.updated_at,
      dotClass: lv.status === "approved" ? "bg-green-400" : "bg-red-400",
      href: "/leave",
    });
  }

  for (const s of (ptRes.data || []) as Array<{ id: string; status: string; updated_at: string; member: { full_name: string } | { full_name: string }[] | null }>) {
    if (!["completed", "cancelled", "no_show"].includes(s.status)) continue;
    const member = Array.isArray(s.member) ? s.member[0] : s.member;
    items.push({
      id: `pt-${s.id}`,
      kind: "pt",
      label: `PT ${s.status.replace("_", " ")}`,
      detail: member?.full_name || "Member",
      at: s.updated_at,
      dotClass:
        s.status === "completed" ? "bg-green-400"
        : s.status === "no_show" ? "bg-red-400"
        : "bg-jai-text",
      href: "/pt",
    });
  }

  for (const t of trialsRes.data || []) {
    const isNew = t.status === "booked" && (!t.updated_at || t.updated_at === t.created_at);
    items.push({
      id: `trial-${t.id}`,
      kind: "trial",
      label: isNew ? "Trial booked" : `Trial → ${t.status.replace("_", " ")}`,
      detail: t.name,
      at: t.updated_at || t.created_at,
      dotClass:
        t.status === "showed" ? "bg-green-400"
        : t.status === "no_show" ? "bg-red-400"
        : "bg-amber-400",
      href: "/trial-management",
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const top = items.slice(0, limit);

  if (top.length === 0) {
    return (
      <div className="bg-jai-card border border-jai-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-1">Today so far</h3>
        <p className="text-xs text-jai-text/70">Nothing yet — it&apos;s quiet.</p>
      </div>
    );
  }

  return (
    <div className="bg-jai-card border border-jai-border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">Today so far</h3>
      <ul className="space-y-2.5">
        {top.map((it) => (
          <li key={it.id}>
            <a href={it.href} className="flex items-start gap-3 group">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${it.dotClass}`} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white group-hover:underline">
                  <span className="text-jai-text/90">{it.label}</span>
                  <span className="text-jai-text/50"> · </span>
                  <span className="truncate">{it.detail}</span>
                </p>
                <p className="text-[10px] text-jai-text/50">{timeAgo(it.at)}</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
