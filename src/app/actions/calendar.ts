"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns ONLY the calling user's own calendar_token.
//
// calendar_token is a sensitive column: after the DB lock the `authenticated`
// role can no longer SELECT it, so the browser client can't read it directly.
// This server action derives identity from the session (auth.uid()) and uses
// the service-role client to read that one row — a caller can never fetch
// anyone else's token.
export async function getMyCalendarToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("calendar_token")
    .eq("id", user.id)
    .maybeSingle();

  return (data as { calendar_token: string | null } | null)?.calendar_token ?? null;
}
