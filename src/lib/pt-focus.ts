import type { SupabaseClient } from "@supabase/supabase-js";
import type { PtSession } from "@/lib/types/database";

type FocusEntry = { date: string; text: string };

export async function fetchPreviousFocusMap(
  db: SupabaseClient,
  memberIds: string[]
): Promise<Map<string, FocusEntry>> {
  const map = new Map<string, FocusEntry>();
  const unique = Array.from(new Set(memberIds)).filter(Boolean);
  if (unique.length === 0) return map;

  const { data } = await db
    .from("pt_sessions")
    .select("member_id, scheduled_at, next_focus")
    .in("member_id", unique)
    .eq("status", "completed")
    .not("next_focus", "is", null)
    .order("scheduled_at", { ascending: false });

  for (const row of (data || []) as { member_id: string; scheduled_at: string; next_focus: string | null }[]) {
    const text = (row.next_focus || "").trim();
    if (!text) continue;
    if (!map.has(row.member_id)) {
      map.set(row.member_id, { date: row.scheduled_at, text });
    }
  }
  return map;
}

export function attachPreviousFocusToNext(
  sessions: PtSession[],
  focusMap: Map<string, FocusEntry>,
  allUpcomingForNextLookup?: PtSession[]
): PtSession[] {
  const nowMs = Date.now();
  const pool = allUpcomingForNextLookup ?? sessions;
  const sorted = [...pool].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
  const nextByMember = new Map<string, string>();
  for (const s of sorted) {
    if (s.status !== "scheduled" && s.status !== "confirmed") continue;
    if (new Date(s.scheduled_at).getTime() < nowMs) continue;
    if (!nextByMember.has(s.member_id)) nextByMember.set(s.member_id, s.id);
  }

  return sessions.map((s) => {
    if (nextByMember.get(s.member_id) !== s.id) return s;
    const focus = focusMap.get(s.member_id);
    if (!focus) return s;
    return { ...s, previousFocus: focus };
  });
}
