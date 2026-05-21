import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Bypass Next.js fetch cache — without this, server-component and cron
        // queries return stale data on subsequent runs. Caught 2026-05-21:
        // trial-reminder cron alerted a cancelled trial because Josephine's
        // updated status=cancelled was masked by an earlier cached row.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
