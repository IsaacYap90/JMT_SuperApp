import { createAdminClient } from "@/lib/supabase/admin";
import { createJaiClient } from "@/lib/supabase/jai";
import {
  chronologicalTimeline,
  conversationContactKeys,
  resolveExactCustomer,
  type CustomerIdentityRecord,
  type CustomerSource,
  type CustomerTimelineEvent,
} from "./customer-resolver";

type AnyRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function trialEmail(row: AnyRow): string | null {
  const details = row.calendly_details;
  return details && typeof details === "object"
    ? text((details as Record<string, unknown>).email)
    : null;
}

export async function loadCustomerTimeline(source: CustomerSource, sourceKey: string) {
  const pub = createAdminClient();
  const jai = createJaiClient();
  const [leadResult, trialResult, jaiLeadResult] = await Promise.all([
    pub.from("leads").select("*").limit(1000),
    pub.from("trial_bookings").select("*").limit(1000),
    jai.from("leads").select("*").limit(1000),
  ]);
  const readError = leadResult.error || trialResult.error || jaiLeadResult.error;
  if (readError) throw new Error(`customer sources unavailable: ${readError.message}`);

  const publicLeads = (leadResult.data ?? []) as AnyRow[];
  const trials = (trialResult.data ?? []) as AnyRow[];
  const jaiLeads = (jaiLeadResult.data ?? []) as AnyRow[];
  const identities: CustomerIdentityRecord[] = [
    ...publicLeads.map((row) => ({ source: "public.leads" as const, sourceKey: String(row.id), name: text(row.name), phone: row.phone, email: row.email })),
    ...trials.map((row) => ({ source: "public.trial_bookings" as const, sourceKey: String(row.id), name: text(row.name), phone: row.phone, email: trialEmail(row) })),
    ...jaiLeads.map((row) => ({ source: "jai.leads" as const, sourceKey: String(row.contact_number), name: text(row.contact_name), phone: row.contact_number, email: null })),
  ];
  const anchor = identities.find((row) => row.source === source && row.sourceKey === sourceKey);
  if (!anchor) return { anchor: null, resolution: null, events: [] as CustomerTimelineEvent[] };

  const resolution = resolveExactCustomer(anchor, identities);
  const selected = resolution.status === "resolved" ? resolution.records : [anchor];
  const keys = new Set(selected.map((row) => `${row.source}:${row.sourceKey}`));
  const events: CustomerTimelineEvent[] = [];

  for (const row of publicLeads) {
    if (!keys.has(`public.leads:${String(row.id)}`)) continue;
    events.push({ id: `lead:${row.id}`, at: String(row.created_at), source: "public.leads", title: `Lead created · ${text(row.status) ?? "unknown status"}`, detail: text(row.interest) });
  }
  for (const row of trials) {
    if (!keys.has(`public.trial_bookings:${String(row.id)}`)) continue;
    events.push({ id: `trial:${row.id}`, at: String(row.created_at), source: "public.trial_bookings", title: `Trial booking · ${text(row.status) ?? "unknown status"}`, detail: [text(row.booking_date), text(row.time_slot), text(row.programme)].filter(Boolean).join(" · ") });
  }
  for (const row of jaiLeads) {
    if (!keys.has(`jai.leads:${String(row.contact_number)}`)) continue;
    const at = text(row.created_at) || text(row.updated_at);
    if (at) events.push({ id: `jai-lead:${row.contact_number}`, at, source: "jai.leads", title: row.is_member ? "WhatsApp contact · member" : "WhatsApp contact created", detail: row.ai_paused ? "Coach takeover active" : null });
  }

  const contactKeys = conversationContactKeys(anchor, selected);
  for (const contactKey of contactKeys) {
    const { data, error } = await jai
      .from("conversations")
      .select("id, contact_number, role, message, via, created_at")
      .eq("contact_number", contactKey)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) throw new Error(`conversation timeline unavailable: ${error.message}`);
    for (const row of (data ?? []) as AnyRow[]) {
      const actor = row.role === "user" ? "Customer" : row.via === "human" ? "Coach Jeremy" : "JAI";
      events.push({ id: `conversation:${row.id}`, at: String(row.created_at), source: "jai.conversations", title: `${actor} message`, detail: text(row.message) });
    }
  }

  return { anchor, resolution, events: chronologicalTimeline(events) };
}
