// Hardcoded "Done" verification flow (Isaac, 2026-07-02).
//
// Goal: when a lead taps the Done button after booking on Calendly, CODE (not
// the AI) verifies the booking against public.trial_bookings:
//   1. match by WhatsApp phone tail first (names lie — kids, WA nicknames);
//   2. Calendly's webhook can lag, so re-check once after a short wait
//      before bothering the customer;
//   3. no match → ask (hardcoded) whether they booked under a different
//      name/number, and verify their answer on the next turn;
//   4. still nothing → escalate to Jeremy with full context.
import { SupabaseClient } from "@supabase/supabase-js";

export type VerifiedBooking = {
  id: string;
  name: string;
  phone: string | null;
  booking_date: string; // YYYY-MM-DD
  className: string;
  startTime: string; // HH:MM[:SS]
};

// Marker baked into the not-found question so the next inbound turn can be
// recognised as the customer's answer (stateless — read from jai history).
export const BOOKING_HINT_MARKER = "different name or phone number";

export function fmtTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${suffix}`;
}

function todaySgtYmd(): string {
  const sg = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return `${sg.getFullYear()}-${String(sg.getMonth() + 1).padStart(2, "0")}-${String(sg.getDate()).padStart(2, "0")}`;
}

function prettyDate(ymd: string): string {
  const today = todaySgtYmd();
  if (ymd === today) return "today";
  const d = new Date(`${ymd}T00:00:00+08:00`);
  const label = d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
  const tomorrow = new Date(new Date(`${today}T00:00:00+08:00`).getTime() + 86400e3);
  const tYmd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  return ymd === tYmd ? `tomorrow (${label})` : label;
}

type BookingRow = {
  id: string;
  name: string;
  phone: string | null;
  booking_date: string;
  class_id: string;
};

async function withClassNames(
  db: SupabaseClient,
  rows: BookingRow[]
): Promise<VerifiedBooking[]> {
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((r) => r.class_id)));
  const { data: classes } = await db
    .from("classes")
    .select("id, name, start_time")
    .in("id", ids);
  const map = new Map((classes || []).map((c) => [c.id, c]));
  return rows.map((r) => {
    const cls = map.get(r.class_id);
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      booking_date: r.booking_date,
      className: cls?.name || "your class",
      startTime: cls?.start_time || "",
    };
  });
}

async function upcomingBooked(db: SupabaseClient): Promise<BookingRow[]> {
  const { data } = await db
    .from("trial_bookings")
    .select("id, name, phone, booking_date, class_id")
    .eq("status", "booked")
    .gte("booking_date", todaySgtYmd())
    .order("booking_date", { ascending: true });
  return (data || []) as BookingRow[];
}

const tail8 = (v: string) => v.replace(/\D/g, "").slice(-8);

// Phone-first lookup: the WA sender's number vs the booking's phone field.
export async function findBookingsByPhone(
  db: SupabaseClient,
  waFrom: string
): Promise<VerifiedBooking[]> {
  const t = tail8(waFrom);
  if (t.length < 8) return [];
  const rows = (await upcomingBooked(db)).filter(
    (r) => r.phone && !r.phone.includes("@") && tail8(r.phone) === t
  );
  return withClassNames(db, rows);
}

// Second chance: the customer told us the name or number they booked with.
export async function findBookingsByHint(
  db: SupabaseClient,
  hint: string
): Promise<VerifiedBooking[]> {
  const digits = hint.replace(/\D/g, "");
  const rows = await upcomingBooked(db);
  let matches: BookingRow[];
  if (digits.length >= 7) {
    const t = digits.slice(-8);
    matches = rows.filter((r) => r.phone && tail8(r.phone) === t);
  } else {
    const needle = hint.trim().toLowerCase();
    matches = rows.filter(
      (r) =>
        needle.length >= 3 &&
        (r.name.toLowerCase().includes(needle) || needle.includes(r.name.toLowerCase()))
    );
  }
  return withClassNames(db, matches);
}

export function confirmationText(bookings: VerifiedBooking[]): string {
  const b = bookings[0];
  const first = (b.name || "").trim().split(/\s+/)[0] || b.name;
  const when = `${prettyDate(b.booking_date)} at ${fmtTime(b.startTime)}`;
  let msg =
    `Confirmed ✅ Trial for ${first} — ${b.className}, ${when}.\n\n` +
    `You'll get a reminder the day before and about an hour before class. See you at the gym! 🥊`;
  if (bookings.length > 1) {
    const rest = bookings
      .slice(1)
      .map((x) => `• ${x.name} — ${x.className}, ${prettyDate(x.booking_date)} ${fmtTime(x.startTime)}`)
      .join("\n");
    msg += `\n\nI also see:\n${rest}`;
  }
  return msg;
}

export function notFoundQuestion(): string {
  return (
    `Hmm, I can't see your booking yet 🤔 Sometimes it takes a minute to come through.\n\n` +
    `Did you book it under a ${BOOKING_HINT_MARKER}? (e.g. booking for your kid, or a different mobile) — just send me the name or number you used and I'll check.`
  );
}

export function stillNotFoundText(): string {
  return (
    `No worries — I'll get Coach Jeremy to confirm your booking personally 🙏 ` +
    `He'll message you shortly. If you haven't actually picked a slot yet, you can do it here: https://calendly.com/jaimuaythaisg/muay-thai-trial-class`
  );
}
