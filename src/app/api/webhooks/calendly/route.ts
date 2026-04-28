// Calendly → JMT trial bookings webhook.
//
// Receives invitee.created and invitee.canceled events from Calendly, resolves
// the booked slot to an existing `classes` row (by day_of_week + start_time in
// Asia/Singapore), and writes to `trial_bookings`. The existing manual flow
// and the AM briefing cron both operate off that same table, so no UI changes
// are needed.
//
// Trial reminders are sent the next morning inside the 6am briefing DM — see
// src/app/api/cron/jmt-am-briefing/route.ts for the recipient resolution.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  verifyCalendlySignature,
  toSgDayAndTime,
  formatTimeSlot,
  type CalendlyInviteePayload,
} from "@/lib/calendly";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";
import { resolveTrialRecipients } from "@/lib/trial-recipients";

// Jeremy (JMT master admin) — always DM'd on new Calendly bookings.
const JEREMY_USER_ID = "2ee6ecaf-f68e-4a0a-a249-0fe7ce019db8";

// If a booking is made within this many hours of the trial start, the 24h
// reminder cron's [23.5h, 24.5h] window will never fire — so we ping the full
// coaches+admins recipient list immediately.
const LATE_BOOKING_THRESHOLD_HOURS = 24;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClassRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  programme: string | null;
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Calendly's Standard plan doesn't expose webhook signing keys. When the
  // signing key is set we verify the HMAC header; otherwise we fall back to
  // re-fetching the invitee from Calendly's API before trusting the payload
  // (see verifyInvitee() below). Either path proves the event is real.
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (signingKey) {
    const sigHeader = req.headers.get("calendly-webhook-signature");
    if (!verifyCalendlySignature(rawBody, sigHeader, signingKey)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let body: CalendlyInviteePayload;
  try {
    body = JSON.parse(rawBody) as CalendlyInviteePayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "supabase env missing" },
      { status: 500 }
    );
  }
  const supabase = createClient(url, key);

  const invitee = body.payload;
  const eventUri = invitee.uri;

  // When signature verification isn't available (Standard Calendly plan),
  // prove the event is real by re-fetching the invitee from Calendly with
  // our PAT. Attackers can't forge a URL that resolves to a live invitee.
  if (!signingKey) {
    const pat = process.env.CALENDLY_PAT;
    if (!pat) {
      console.error("[calendly-webhook] no signing key AND no CALENDLY_PAT — cannot verify");
      return NextResponse.json({ error: "not configured" }, { status: 500 });
    }
    try {
      const verify = await fetch(eventUri, {
        headers: { Authorization: `Bearer ${pat}` },
      });
      if (!verify.ok) {
        console.error(
          `[calendly-webhook] invitee re-fetch failed (${verify.status}) for ${eventUri}`
        );
        return NextResponse.json({ error: "unverified" }, { status: 401 });
      }
    } catch (e) {
      console.error("[calendly-webhook] invitee re-fetch error:", e);
      return NextResponse.json({ error: "verify failed" }, { status: 502 });
    }
  }

  if (body.event === "invitee.canceled") {
    // Mark any matching trial as cancelled. Idempotent — if we never received
    // the original created event, there's nothing to cancel and that's fine.
    const { error } = await supabase
      .from("trial_bookings")
      .update({ status: "cancelled" })
      .eq("calendly_event_uri", eventUri);
    if (error) {
      console.error("[calendly-webhook] cancel update failed:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "cancelled", uri: eventUri });
  }

  if (body.event !== "invitee.created") {
    return NextResponse.json({ ok: true, skipped: body.event });
  }

  // Resolve to a class
  const start = invitee.scheduled_event.start_time;
  const { dayOfWeek, startTime, bookingDate } = toSgDayAndTime(start);

  const { data: matches, error: classErr } = await supabase
    .from("classes")
    .select("id, name, start_time, end_time, programme")
    .eq("day_of_week", dayOfWeek)
    .eq("start_time", startTime)
    .eq("is_active", true);

  if (classErr) {
    console.error("[calendly-webhook] class lookup failed:", classErr.message);
    return NextResponse.json({ ok: false, error: classErr.message }, { status: 500 });
  }

  const cls = (matches || [])[0] as ClassRow | undefined;
  if (!cls) {
    console.error(
      `[calendly-webhook] no active class for ${dayOfWeek} ${startTime} (invitee ${eventUri})`
    );
    // Return 200 so Calendly doesn't retry forever on an unmappable slot
    return NextResponse.json({
      ok: false,
      reason: "no_matching_class",
      dayOfWeek,
      startTime,
    });
  }

  // Pull contact fields. Calendly sometimes stores phone in a Q&A field.
  const name =
    invitee.name ||
    [invitee.first_name, invitee.last_name].filter(Boolean).join(" ") ||
    invitee.email ||
    "Calendly lead";
  const rawPhone =
    (invitee as { text_reminder_number?: string }).text_reminder_number ||
    (invitee.questions_and_answers || []).find((qa) =>
      /phone|mobile|contact|whatsapp/i.test(qa.question)
    )?.answer ||
    invitee.email ||
    "";
  // UI auto-prefixes "+65" to whatever's stored; strip country code + spaces
  // so we don't end up with "+6598806620". Emails (contain @) pass through.
  const phone = /@/.test(rawPhone)
    ? rawPhone
    : rawPhone.replace(/^\+?65/, "").replace(/\s+/g, "");
  const notes =
    (invitee.questions_and_answers || [])
      .filter((qa) => !/phone|mobile|contact|whatsapp/i.test(qa.question))
      .map((qa) => qa.answer)
      .filter((a) => a && a.trim().length > 0)
      .join(" • ") || null;

  // Idempotent upsert by calendly_event_uri (unique index)
  const timeSlot = formatTimeSlot(cls.start_time, cls.end_time);
  const { data: existing } = await supabase
    .from("trial_bookings")
    .select("id")
    .eq("calendly_event_uri", eventUri)
    .maybeSingle();
  const isNew = !existing;

  const { error: insertErr } = await supabase
    .from("trial_bookings")
    .upsert(
      {
        name,
        phone,
        programme: cls.programme || "adult",
        class_id: cls.id,
        booking_date: bookingDate,
        time_slot: timeSlot,
        status: "booked",
        source: "calendly",
        calendly_event_uri: eventUri,
        notes,
      },
      { onConflict: "calendly_event_uri" }
    );

  if (insertErr) {
    console.error("[calendly-webhook] insert failed:", insertErr.message);
    return NextResponse.json(
      { ok: false, error: insertErr.message },
      { status: 500 }
    );
  }

  // Hours between booking-now and trial start (in SGT-anchored absolute time)
  const trialStartUtc = new Date(`${bookingDate}T${cls.start_time}+08:00`).getTime();
  const hoursUntilTrial = (trialStartUtc - Date.now()) / (1000 * 60 * 60);
  const isLateBooking = hoursUntilTrial < LATE_BOOKING_THRESHOLD_HOURS;

  let lateCoachesNotified = 0;
  if (isNew) {
    const prettyDate = new Date(`${bookingDate}T00:00:00+08:00`).toLocaleDateString(
      "en-SG",
      { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore" }
    );

    // Standard "new booking" DM to Jeremy on every brand-new booking.
    const newBookingLines = [
      "🆕 New trial booking",
      `${name} — ${cls.name}`,
      `${prettyDate} · ${timeSlot}`,
      phone ? `📞 ${phone}` : null,
      notes ? `📝 ${notes}` : null,
    ].filter(Boolean) as string[];
    await sendTelegramPlainToUser(JEREMY_USER_ID, newBookingLines.join("\n"));

    // If the booking is too late for the 24h cron's window to ever catch,
    // immediately ping the full recipient list (coaches assigned to the class
    // + all admins). Without this, a 14h-out booking would only surface in
    // the next 6am AM briefing — which can be hours away on the day-of.
    if (isLateBooking) {
      // Re-fetch class with its coach roster for the recipient resolver
      const { data: classWithCoaches } = await supabase
        .from("classes")
        .select(
          "id, name, start_time, end_time, lead_coach_id, assistant_coach_id, class_coaches(coach_id)"
        )
        .eq("id", cls.id)
        .single();

      if (classWithCoaches) {
        const recipientIds = await resolveTrialRecipients(
          supabase,
          classWithCoaches
        );
        const lateLines = [
          `⚡ Late trial booking (${hoursUntilTrial.toFixed(1)}h notice)`,
          `${name} — ${cls.name}`,
          `${prettyDate} · ${timeSlot}`,
          phone ? `📞 ${phone}` : null,
          notes ? `📝 ${notes}` : null,
        ].filter(Boolean) as string[];
        const message = lateLines.join("\n");

        // Don't double-ping Jeremy — he already got the new-booking DM above
        const filtered = recipientIds.filter((id) => id !== JEREMY_USER_ID);
        for (const uid of filtered) {
          const ok = await sendTelegramPlainToUser(uid, message);
          if (ok) lateCoachesNotified += 1;
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    class_id: cls.id,
    booking_date: bookingDate,
    time_slot: timeSlot,
    notified_jeremy: isNew,
    late_booking: isLateBooking,
    late_coaches_notified: lateCoachesNotified,
    hours_until_trial: Number(hoursUntilTrial.toFixed(2)),
  });
}
