// GET /api/activity — master_admin (Jeremy) only.
// Builds a daily activity feed of what the JAI WhatsApp assistant has done, derived
// from the `jai` schema: bot replies (conversations), trial bookings (trial_bookings),
// and lead actions with real timestamps (booking-link sent, follow-ups, escalations).
// Each entry carries a click-to-verify deep link (WA inbox thread or trial management).
import { NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActivityType = "reply" | "trial_booked" | "booking_link" | "followup" | "escalated";
type Activity = {
  id: string;
  type: ActivityType;
  ts: string;
  contact_number: string;
  contact_name: string | null;
  title: string;
  snippet: string | null;
  link: string;
};

const inboxLink = (num: string) => `/wa-inbox?contact=${encodeURIComponent(num)}`;

export async function GET() {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createJaiClient();
  const activities: Activity[] = [];

  // Name lookup: prefer the lead's saved name, fall back to whatever a row carries.
  const { data: leadRows } = await supabase
    .from("leads")
    .select(
      "contact_number, contact_name, escalated_to, booking_link_sent_at, followup1_sent_at, followup2_sent_at, updated_at"
    );
  type Lead = {
    contact_number: string;
    contact_name: string | null;
    escalated_to: string | null;
    booking_link_sent_at: string | null;
    followup1_sent_at: string | null;
    followup2_sent_at: string | null;
    updated_at: string | null;
  };
  const leads = (leadRows || []) as Lead[];
  const nameByPhone = new Map<string, string | null>();
  for (const l of leads) nameByPhone.set(l.contact_number, l.contact_name);
  const nameOf = (num: string, fallback: string | null) =>
    nameByPhone.get(num) || fallback || `+${num}`;

  // 1. JAI bot replies (role='assistant' AND via='bot').
  const { data: convRows } = await supabase
    .from("conversations")
    .select("id, contact_number, contact_name, message, created_at")
    .eq("role", "assistant")
    .eq("via", "bot")
    .order("created_at", { ascending: false })
    .limit(500);
  type Conv = {
    id: string;
    contact_number: string;
    contact_name: string | null;
    message: string;
    created_at: string;
  };
  for (const m of (convRows || []) as Conv[]) {
    const name = nameOf(m.contact_number, m.contact_name);
    activities.push({
      id: `reply-${m.id}`,
      type: "reply",
      ts: m.created_at,
      contact_number: m.contact_number,
      contact_name: name,
      title: `JAI replied to ${name}`,
      snippet: m.message,
      link: inboxLink(m.contact_number),
    });
  }

  // 2. Trial bookings.
  const { data: trialRows } = await supabase
    .from("trial_bookings")
    .select("id, contact_number, contact_name, scheduled_date, class_type, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  type Trial = {
    id: string;
    contact_number: string;
    contact_name: string | null;
    scheduled_date: string | null;
    class_type: string | null;
    created_at: string;
  };
  for (const t of (trialRows || []) as Trial[]) {
    const name = nameOf(t.contact_number, t.contact_name);
    const when = t.scheduled_date
      ? new Date(t.scheduled_date).toLocaleString("en-SG", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Singapore",
        })
      : null;
    activities.push({
      id: `trial-${t.id}`,
      type: "trial_booked",
      ts: t.created_at,
      contact_number: t.contact_number,
      contact_name: name,
      title: `Trial booked — ${name}`,
      snippet: [t.class_type, when].filter(Boolean).join(" · ") || null,
      link: "/trial-management",
    });
  }

  // 3. Lead actions with real timestamps: booking link, follow-ups, escalation.
  for (const l of leads) {
    const name = nameOf(l.contact_number, l.contact_name);
    if (l.booking_link_sent_at) {
      activities.push({
        id: `blink-${l.contact_number}`,
        type: "booking_link",
        ts: l.booking_link_sent_at,
        contact_number: l.contact_number,
        contact_name: name,
        title: `JAI sent booking link to ${name}`,
        snippet: null,
        link: inboxLink(l.contact_number),
      });
    }
    if (l.followup1_sent_at) {
      activities.push({
        id: `f1-${l.contact_number}`,
        type: "followup",
        ts: l.followup1_sent_at,
        contact_number: l.contact_number,
        contact_name: name,
        title: `JAI sent a follow-up to ${name}`,
        snippet: null,
        link: inboxLink(l.contact_number),
      });
    }
    if (l.followup2_sent_at) {
      activities.push({
        id: `f2-${l.contact_number}`,
        type: "followup",
        ts: l.followup2_sent_at,
        contact_number: l.contact_number,
        contact_name: name,
        title: `JAI sent a 2nd follow-up to ${name}`,
        snippet: null,
        link: inboxLink(l.contact_number),
      });
    }
    // Escalation has no dedicated timestamp — use updated_at as the best-available time.
    if (l.escalated_to && l.updated_at) {
      activities.push({
        id: `esc-${l.contact_number}`,
        type: "escalated",
        ts: l.updated_at,
        contact_number: l.contact_number,
        contact_name: name,
        title: `Escalated to Coach Jeremy — ${name}`,
        snippet: null,
        link: inboxLink(l.contact_number),
      });
    }
  }

  activities.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return NextResponse.json({ activities });
}
