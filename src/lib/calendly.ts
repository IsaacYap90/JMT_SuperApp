// Calendly helpers: webhook signature verification + minimal API client.
//
// Env vars:
//   CALENDLY_PAT                  — Personal Access Token (scopes: webhooks:read,
//                                   webhooks:write, event_types:read, scheduled_events:read)
//   CALENDLY_WEBHOOK_SIGNING_KEY  — signing key returned when the webhook
//                                   subscription was created (see scripts/register-calendly-webhook.mjs)

import { createHmac, timingSafeEqual } from "node:crypto";

export const CALENDLY_API_BASE = "https://api.calendly.com";

// Calendly sends a `Calendly-Webhook-Signature` header of the form:
//   t=<unix seconds>,v1=<hex hmac sha256>
// The signed payload is `<t>.<raw body>`.
//
// https://developer.calendly.com/api-docs/ZG9jOjM2MzE2MDM4-webhook-signatures
export function verifyCalendlySignature(
  rawBody: string,
  header: string | null,
  signingKey: string
): boolean {
  if (!header || !signingKey) return false;

  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  // Reject stale payloads (>5 min) to blunt replay attempts
  const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(t, 10);
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300 || ageSeconds < -60) {
    return false;
  }

  const expected = createHmac("sha256", signingKey)
    .update(`${t}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Minimal typed payload — we only use a subset of fields. Calendly sends
// much more than this but we don't care about most of it.
export type CalendlyInviteePayload = {
  event: "invitee.created" | "invitee.canceled";
  payload: {
    uri: string;
    email?: string;
    name?: string;
    first_name?: string | null;
    last_name?: string | null;
    status?: string;
    cancel_reason?: string | null;
    rescheduled?: boolean;
    questions_and_answers?: Array<{
      question: string;
      answer: string;
    }>;
    scheduled_event: {
      uri: string;
      name?: string;
      start_time: string; // ISO 8601 UTC
      end_time: string;
      event_type?: string; // URI to event type
    };
  };
};

export async function calendlyFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const pat = process.env.CALENDLY_PAT;
  if (!pat) throw new Error("CALENDLY_PAT is not set");

  const res = await fetch(`${CALENDLY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendly API ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

// Convert Calendly's ISO UTC start_time to { day_of_week, hhmmss } in Asia/Singapore.
// Matches the `classes.day_of_week` (lowercase) + `classes.start_time` (HH:MM:SS) shape.
const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function toSgDayAndTime(isoUtc: string): {
  dayOfWeek: string;
  startTime: string; // HH:MM:SS
  bookingDate: string; // YYYY-MM-DD (SGT)
} {
  const d = new Date(isoUtc);

  // Format in Asia/Singapore
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

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  const weekday = get("weekday").toLowerCase();
  const day = get("day");
  const month = get("month");
  const year = get("year");
  let hour = get("hour");
  if (hour === "24") hour = "00"; // Intl en-GB quirk
  const minute = get("minute");
  const second = get("second");

  return {
    dayOfWeek: DAY_NAMES.includes(weekday) ? weekday : weekday,
    startTime: `${hour}:${minute}:${second}`,
    bookingDate: `${year}-${month}-${day}`,
  };
}

// Format time slot string "HH:MM - HH:MM" (matching existing manual bookings)
export function formatTimeSlot(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}
