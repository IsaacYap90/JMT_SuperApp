import { createAdminClient } from "@/lib/supabase/admin";
import { phonePtChanged, phonePtTime, type PtBaseline } from "./phone-policy";
import { setDraftDescription, type GCalListedEvent } from "./google-calendar";
import type { GCalConnection } from "./connection";

export interface PhoneEventMap {
  local_entity_key: string;
  google_event_id: string | null;
  deleted: boolean;
  pt_baseline: PtBaseline | null;
}

/** Ingest only canonical mapped PTs in the stored app-owned calendar. */
export async function ingestPhoneChanges(
  conn: GCalConnection, accessToken: string, calendarId: string,
  remote: GCalListedEvent[], maps: Map<string, PhoneEventMap>, errors: string[]
): Promise<void> {
  const sb = createAdminClient();
  const { data: actor, error: actorError } = await sb.from("users").select("role, is_active").eq("id", conn.user_id).maybeSingle();
  if (actorError) throw new Error(`Calendar permissions: ${actorError.message}`);
  if (!actor?.is_active || !["coach", "master_admin"].includes(actor.role)) return;
  const byId = new Map(remote.map(event => [event.id, event]));
  for (const map of Array.from(maps.values())) {
    if (!map.local_entity_key.startsWith("pt:") || map.deleted || !map.google_event_id || !map.pt_baseline) continue;
    const event = byId.get(map.google_event_id);
    // Missing from a list is NOT proof of deletion. Only Google's explicit
    // cancelled tombstone can cancel the business record.
    if (!event || !phonePtChanged(event, map.pt_baseline)) continue;
    const time = phonePtTime(event);
    const { data, error } = await sb.rpc("apply_gcal_pt_change", {
      p_connection_id: conn.id, p_google_event_id: event.id, p_expected: map.pt_baseline,
      p_scheduled_at: time?.scheduled_at ?? null, p_duration: time?.duration_minutes ?? null,
      p_cancel: event.status === "cancelled",
    });
    if (error) throw new Error(`Phone PT update: ${error.message}`);
    if (data !== "applied") errors.push(`Phone PT change rejected (${data}); JMT schedule restored`);
  }

  // Any new timed event in this dedicated calendar is a draft, never a real
  // booking until Jeremy selects the member and coach in authenticated JMT.
  const mappedIds = new Set(Array.from(maps.values()).map(map => map.google_event_id));
  const { data: draftRows, error: draftError } = await sb.from("gcal_pt_drafts")
    .select("id, google_event_id, status, summary, scheduled_at, duration_minutes").eq("connection_id", conn.id);
  if (draftError) throw new Error(`Calendar drafts: ${draftError.message}`);
  const drafts = new Map((draftRows || []).map(draft => [draft.google_event_id, draft]));
  for (const event of remote) {
    if (mappedIds.has(event.id) || event.extendedProperties?.private?.jmt_key) continue;
    const existing = drafts.get(event.id);
    if (existing && existing.status !== "pending") continue;
    if (event.status === "cancelled") {
      if (existing) {
        const { error } = await sb.from("gcal_pt_drafts").update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", existing.id).eq("status", "pending");
        if (error) throw new Error(error.message);
      }
      continue;
    }
    const time = phonePtTime(event);
    if (!time || Date.parse(time.scheduled_at) <= Date.now()) continue;
    const summary = (event.summary || "New PT").slice(0, 500);
    let draftId = existing?.id;
    if (!existing) {
      const { data, error } = await sb.from("gcal_pt_drafts").insert({ connection_id: conn.id, google_event_id: event.id, summary, ...time }).select("id").single();
      if (error) throw new Error(`Create PT draft: ${error.message}`);
      draftId = data.id;
    } else if (existing.summary !== summary || Date.parse(existing.scheduled_at) !== Date.parse(time.scheduled_at) || existing.duration_minutes !== time.duration_minutes) {
      const { error } = await sb.from("gcal_pt_drafts").update({ summary, ...time, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("status", "pending");
      if (error) throw new Error(error.message);
    }
    const link = `${(process.env.NEXT_PUBLIC_APP_URL || "https://jmtos.ionicx.ai").replace(/\/$/, "")}/calendar/manage?draft=${draftId}`;
    if (!event.description?.includes(link)) {
      await setDraftDescription(accessToken, calendarId, event.id,
        `${event.description || ""}\n\nPending PT draft — Jeremy must select client and coach before booking.\n${link}`.trim());
    }
  }
}
