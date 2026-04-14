// One-off: backfill existing Calendly scheduled events into trial_bookings.
//
// Usage:
//   CALENDLY_PAT=... \
//   CALENDLY_USER_URI=https://api.calendly.com/users/<uuid> \
//   NEXT_PUBLIC_SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   FROM=2026-04-11  (optional — defaults to today SGT)
//   MIN_START_TIME=2026-04-11T00:00:00Z  (optional override)
//     node scripts/backfill-calendly-bookings.mjs
//
// Safe to re-run: upserts on calendly_event_uri (unique index).
// Skips events that don't map to an active JMT class slot.

import { createClient } from "@supabase/supabase-js";

const API = "https://api.calendly.com";

function env(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function cf(path, init = {}) {
  const pat = env("CALENDLY_PAT");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Calendly ${res.status} ${path}: ${JSON.stringify(body)}`);
  }
  return body;
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function toSg(isoUtc) {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const day = get("weekday").toLowerCase();
  return {
    dayOfWeek: DAY_NAMES.includes(day) ? day : day,
    startTime: `${hour}:${get("minute")}:${get("second")}`,
    bookingDate: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

async function main() {
  const userUri = env("CALENDLY_USER_URI");
  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");

  const minStart =
    process.env.MIN_START_TIME ||
    (() => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return today.toISOString();
    })();
  console.log("Backfilling Calendly events from:", minStart);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Page through all future scheduled events for this user
  const events = [];
  let nextToken = null;
  do {
    const qs = new URLSearchParams({
      user: userUri,
      status: "active",
      min_start_time: minStart,
      count: "100",
    });
    if (nextToken) qs.set("page_token", nextToken);
    const resp = await cf(`/scheduled_events?${qs.toString()}`);
    for (const e of resp.collection || []) events.push(e);
    nextToken = resp.pagination?.next_page_token || null;
  } while (nextToken);

  console.log(`Found ${events.length} active scheduled events`);

  let inserted = 0;
  let skippedNoClass = 0;
  let skippedNoInvitee = 0;
  let errored = 0;

  for (const ev of events) {
    const eventUri = ev.uri;
    const { dayOfWeek, startTime, bookingDate } = toSg(ev.start_time);

    // Match class
    const { data: matches, error: classErr } = await supabase
      .from("classes")
      .select("id, name, start_time, end_time, programme")
      .eq("day_of_week", dayOfWeek)
      .eq("start_time", startTime)
      .eq("is_active", true);
    if (classErr) {
      console.error("class lookup failed:", classErr.message);
      errored++;
      continue;
    }
    const cls = (matches || [])[0];
    if (!cls) {
      console.log(
        `  - skip (no class): ${ev.name} @ ${dayOfWeek} ${startTime} (${bookingDate})`
      );
      skippedNoClass++;
      continue;
    }

    // Fetch invitees for this event (active only)
    const inviteesResp = await cf(
      `${ev.uri.replace(API, "")}/invitees?status=active&count=10`
    );
    const invitees = inviteesResp.collection || [];
    if (invitees.length === 0) {
      skippedNoInvitee++;
      continue;
    }

    for (const inv of invitees) {
      const name =
        inv.name ||
        [inv.first_name, inv.last_name].filter(Boolean).join(" ") ||
        inv.email ||
        "Calendly lead";
      const rawPhone =
        inv.text_reminder_number ||
        (inv.questions_and_answers || []).find((qa) =>
          /phone|mobile|contact|whatsapp/i.test(qa.question)
        )?.answer ||
        inv.email ||
        "";
      // UI auto-prefixes "+65" to whatever's stored, so strip country code +
      // whitespace. Leave emails alone (no digits).
      const phone = /@/.test(rawPhone)
        ? rawPhone
        : rawPhone.replace(/^\+?65/, "").replace(/\s+/g, "");
      const notes =
        (inv.questions_and_answers || [])
          .filter((qa) => !/phone|mobile|contact|whatsapp/i.test(qa.question))
          .map((qa) => qa.answer)
          .filter((a) => a && a.trim().length > 0)
          .join(" • ") || null;

      const row = {
        name,
        phone,
        programme: cls.programme || "adult",
        class_id: cls.id,
        booking_date: bookingDate,
        time_slot: `${cls.start_time.slice(0, 5)} - ${cls.end_time.slice(0, 5)}`,
        status: "booked",
        source: "calendly",
        calendly_event_uri: inv.uri, // per-invitee URI (not scheduled_event URI) — unique per booking
        notes,
      };

      const { error: upErr } = await supabase
        .from("trial_bookings")
        .upsert(row, { onConflict: "calendly_event_uri" });
      if (upErr) {
        console.error(`upsert failed for ${inv.uri}:`, upErr.message);
        errored++;
      } else {
        console.log(
          `  + ${name} — ${cls.name} ${bookingDate} ${row.time_slot}`
        );
        inserted++;
      }
    }
  }

  console.log(
    `\nDone. inserted=${inserted}, skipped_no_class=${skippedNoClass}, skipped_no_invitee=${skippedNoInvitee}, errored=${errored}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
