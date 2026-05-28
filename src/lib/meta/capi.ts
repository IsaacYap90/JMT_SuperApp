// Meta Conversions API "Conversion Leads" feedback for JMT — posts a
// system-generated funnel-stage event back to JMT's Meta dataset so Meta can
// optimize lead-ad delivery for higher-quality leads.
//
// Ported from the Lead OS / Airple implementation, simplified to single-tenant:
// the dataset ID + access token come from env (JMT_META_CAPI_DATASET_ID,
// JMT_META_CAPI_ACCESS_TOKEN) rather than a per-tenant config row.
//
// Conversion Leads keys off the Meta lead_id (the lead originated from a Meta
// lead form, synced into `leads.meta_lead_id`). Idempotent: skips if a
// jmt_capi_events row already exists for (lead_id, event_name). Non-fatal —
// never throws into the caller.

import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadStatus } from "@/app/actions/leads";

const API_VERSION = process.env.META_API_VERSION || "v22.0";

// JMT lead status → CAPI event_name. Only these statuses fire a conversion event.
// "new" is the lead Meta already knows about (it created it), so no event.
export const STATUS_EVENT_MAP: Partial<Record<LeadStatus, string>> = {
  contacted: "qualified",
  converted: "closed_won",
  lost: "lost",
};

export async function sendConversionLeadEvent(opts: {
  leadId: string;
  datasetId: string;
  accessToken: string;
  metaLeadId: string;
  eventName: string;
  eventTime?: number; // unix seconds; defaults to now
}): Promise<{ ok: boolean; httpStatus: number; error?: string }> {
  const db = createAdminClient();

  // Idempotency — one event per lead per funnel stage.
  const { data: existing } = await db
    .from("jmt_capi_events")
    .select("id")
    .eq("lead_id", opts.leadId)
    .eq("event_name", opts.eventName)
    .maybeSingle();
  if (existing) return { ok: true, httpStatus: 0 };

  const eventTime = opts.eventTime ?? Math.floor(Date.now() / 1000);
  const body = {
    data: [
      {
        event_name: opts.eventName,
        event_time: eventTime,
        action_source: "system_generated",
        user_data: { lead_id: opts.metaLeadId },
      },
    ],
  };

  let httpStatus = 0;
  let errMsg: string | undefined;
  let response: unknown;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${opts.datasetId}/events?access_token=${encodeURIComponent(opts.accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    httpStatus = res.status;
    const json = await res.json().catch(() => ({}));
    response = json;
    if (!res.ok) errMsg = json?.error?.message || `HTTP ${res.status}`;
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
  }

  try {
    await db.from("jmt_capi_events").insert({
      lead_id: opts.leadId,
      meta_lead_id: opts.metaLeadId,
      event_name: opts.eventName,
      ok: !errMsg,
      http_status: httpStatus,
      error: errMsg ?? null,
      response: response ?? null,
    });
  } catch {
    /* non-fatal — likely the (lead_id,event_name) unique index racing */
  }

  return { ok: !errMsg, httpStatus, error: errMsg };
}
