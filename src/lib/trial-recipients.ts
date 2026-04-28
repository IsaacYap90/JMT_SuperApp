// Resolve trial-reminder recipients (coaches assigned to the class + all admins).
//
// Used by:
//   - Calendly webhook (when a booking is made <24h before the trial — the 24h
//     cron's [23.5h, 24.5h] window can never fire for it)
//   - 24h-before cron (existing path)
//   - 6h-before backstop cron (catches anything that fell through)
//
// All three paths call this helper so the recipient set stays consistent.

import { SupabaseClient } from "@supabase/supabase-js";

export type ClassRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  lead_coach_id: string | null;
  assistant_coach_id: string | null;
  class_coaches?: { coach_id: string }[] | null;
};

export async function resolveTrialRecipients(
  supabase: SupabaseClient,
  classRow: ClassRow
): Promise<string[]> {
  const ids = new Set<string>();

  if (classRow.lead_coach_id) ids.add(classRow.lead_coach_id);
  if (classRow.assistant_coach_id) ids.add(classRow.assistant_coach_id);
  for (const cc of classRow.class_coaches || []) {
    if (cc.coach_id) ids.add(cc.coach_id);
  }

  // All admins always receive trial reminders
  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .in("role", ["admin", "master_admin"])
    .eq("is_active", true)
    .is("merged_into_id", null);
  for (const u of admins || []) ids.add(u.id);

  // Filter out any inactive / merged users
  const idArray = Array.from(ids);
  if (idArray.length === 0) return [];
  const { data: active } = await supabase
    .from("users")
    .select("id")
    .in("id", idArray)
    .eq("is_active", true)
    .is("merged_into_id", null);
  return (active || []).map((u) => u.id);
}

/** "07:30:00" + "08:30:00" → "7:30am – 8:30am" */
export function formatClassWindow(startHHMMSS: string, endHHMMSS: string): string {
  return `${formatTime(startHHMMSS)}–${formatTime(endHHMMSS)}`;
}

function formatTime(hhmmss: string): string {
  const [hStr, mStr] = hhmmss.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${suffix}`;
}
