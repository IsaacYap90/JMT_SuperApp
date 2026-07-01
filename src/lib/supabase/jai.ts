import { createClient } from "@supabase/supabase-js";

// Service-role client scoped to the `jai` schema — the JAI WhatsApp bot's data
// (conversations + leads) lives there, in the same Supabase project as JMT OS.
// Used only by the master_admin WhatsApp Inbox.
export function createJaiClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "jai" },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
