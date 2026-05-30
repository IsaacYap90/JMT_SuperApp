// One-off backfill: populate trial_bookings.calendly_details (email + full Q&A)
// for existing Calendly bookings by re-fetching each invitee from the Calendly API.
// Idempotent — skips rows that already have calendly_details.
//
// Run:  NEXT_PUBLIC_SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. CALENDLY_PAT=.. \
//         node scripts/backfill-calendly-details.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAT = process.env.CALENDLY_PAT;
if (!URL || !KEY || !PAT) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / CALENDLY_PAT");
  process.exit(1);
}
const sb = createClient(URL, KEY);

const { data: rows, error } = await sb
  .from("trial_bookings")
  .select("id, calendly_event_uri, calendly_details")
  .eq("source", "calendly")
  .not("calendly_event_uri", "is", null);
if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}

let done = 0, skip = 0, fail = 0;
for (const r of rows) {
  if (r.calendly_details) { skip++; continue; }
  try {
    const res = await fetch(r.calendly_event_uri, {
      headers: { Authorization: `Bearer ${PAT}` },
    });
    if (!res.ok) {
      console.error(`fetch ${res.status} for ${r.id} (${r.calendly_event_uri})`);
      fail++;
      continue;
    }
    const inv = (await res.json()).resource || {};
    const details = {
      email: inv.email ?? null,
      questions_and_answers: (inv.questions_and_answers || []).map((qa) => ({
        question: qa.question,
        answer: qa.answer,
      })),
    };
    const { error: upErr } = await sb
      .from("trial_bookings")
      .update({ calendly_details: details })
      .eq("id", r.id);
    if (upErr) { console.error(`update fail ${r.id}: ${upErr.message}`); fail++; continue; }
    done++;
  } catch (e) {
    console.error(`error ${r.id}: ${e.message}`);
    fail++;
  }
}
console.log(JSON.stringify({ total: rows.length, done, skip, fail }));
