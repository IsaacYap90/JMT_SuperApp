import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCustomerEmail, normalizeCustomerPhone } from "@/lib/customer-identity";
import {
  decideAutomaticLeadTransition,
  decideManualLeadTransition,
  leadTransitionIdempotencyKey,
  type LeadLifecycleStatus,
  type LeadTransitionTrigger,
} from "./lifecycle";

type LeadRow = { id: string; status: LeadLifecycleStatus; phone: string | null; email: string | null };

export type LifecycleActor = { type: "admin" | "coach" | "jai" | "system"; id?: string | null };
export type LifecycleSource = { schema?: string | null; table?: string | null; key: string };
export type LifecycleOutcome = "applied" | "duplicate" | "noop" | "rejected" | "conflict" | "not_found";

export function resolveUniquePublicLead(
  rows: LeadRow[],
  identity: { phone?: unknown; email?: unknown }
): { kind: "matched"; lead: LeadRow; matchedBy: "phone" | "email" } | { kind: "ambiguous" | "unmatched" } {
  const phone = normalizeCustomerPhone(identity.phone);
  if (phone) {
    const matches = rows.filter((row) => normalizeCustomerPhone(row.phone) === phone);
    if (matches.length > 1) return { kind: "ambiguous" };
    if (matches.length === 1) return { kind: "matched", lead: matches[0], matchedBy: "phone" };
  }
  const email = normalizeCustomerEmail(identity.email);
  if (email) {
    const matches = rows.filter((row) => normalizeCustomerEmail(row.email) === email);
    if (matches.length > 1) return { kind: "ambiguous" };
    if (matches.length === 1) return { kind: "matched", lead: matches[0], matchedBy: "email" };
  }
  return { kind: "unmatched" };
}

export type TransitionGateway = {
  status(leadId: string): Promise<LeadLifecycleStatus | null>;
  commit(input: Record<string, unknown>): Promise<"applied" | "duplicate" | "conflict" | "not_found">;
};

export async function executeLeadTransition(input: {
  leadId: string;
  to: LeadLifecycleStatus;
  trigger: LeadTransitionTrigger;
  source: LifecycleSource;
  actor: LifecycleActor;
  automatic: boolean;
  metadata?: Record<string, unknown>;
}, gateway: TransitionGateway): Promise<LifecycleOutcome> {
  const from = await gateway.status(input.leadId);
  if (!from) return "not_found";
  const decision = input.automatic
    ? decideAutomaticLeadTransition(from, input.to, input.trigger)
    : decideManualLeadTransition(from, input.to);
  if (decision.kind === "noop") return "noop";
  if (decision.kind === "reject") return "rejected";
  return gateway.commit({
    p_lead_id: input.leadId,
    p_expected_from: from,
    p_to_status: input.to,
    p_trigger: input.trigger,
    p_idempotency_key: leadTransitionIdempotencyKey({ leadId: input.leadId, to: input.to, trigger: input.trigger, sourceRecordId: input.source.key }),
    p_actor_type: input.actor.type,
    p_actor_id: input.actor.id ?? null,
    p_source_schema: input.source.schema ?? null,
    p_source_table: input.source.table ?? null,
    p_source_key: input.source.key,
    p_metadata: input.metadata ?? {},
  });
}

function supabaseGateway(db: ReturnType<typeof createAdminClient>): TransitionGateway {
  return {
    async status(leadId) {
      const { data, error } = await db.from("leads").select("status").eq("id", leadId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.status as LeadLifecycleStatus | undefined) ?? null;
    },
    async commit(input) {
      const { data, error } = await db.rpc("apply_lead_stage_transition", input);
      if (error) throw new Error(error.message);
      return data as "applied" | "duplicate" | "conflict" | "not_found";
    },
  };
}

export async function transitionLeadStage(input: Parameters<typeof executeLeadTransition>[0]) {
  const db = createAdminClient();
  return executeLeadTransition(input, supabaseGateway(db));
}

export async function transitionExactPublicLead(input: {
  identity: { phone?: unknown; email?: unknown };
  to: LeadLifecycleStatus;
  trigger: LeadTransitionTrigger;
  source: LifecycleSource;
  actor: LifecycleActor;
}) {
  const db = createAdminClient();
  const { data, error } = await db.from("leads").select("id, status, phone, email").limit(1000);
  if (error) throw new Error(error.message);
  const resolved = resolveUniquePublicLead((data ?? []) as LeadRow[], input.identity);
  if (resolved.kind !== "matched") return resolved.kind;
  return executeLeadTransition({ ...input, leadId: resolved.lead.id, automatic: true, metadata: { matched_by: resolved.matchedBy } }, supabaseGateway(db));
}
