import { normalizeCustomerEmail, normalizeCustomerPhone } from "@/lib/customer-identity";
import type { LeadLifecycleStatus } from "./lifecycle";

export const LEAD_QUIET_PERIOD_MS = 48 * 60 * 60 * 1000;

export type SilenceSweepReason =
  | "eligible"
  | "stage_protected"
  | "identity_ambiguous"
  | "booked_trial"
  | "quiet_period_not_elapsed"
  | "invalid_activity_time";

export type SilenceSweepDecision =
  | { eligible: true; reason: "eligible"; quietSince: string; eligibleAt: string }
  | { eligible: false; reason: Exclude<SilenceSweepReason, "eligible">; eligibleAt?: string };

export function hasAmbiguousLeadIdentity(
  lead: { id: string; phone?: unknown; email?: unknown },
  leads: Array<{ id: string; phone?: unknown; email?: unknown }>
): boolean {
  const phone = normalizeCustomerPhone(lead.phone);
  if (phone) {
    return leads.filter((row) => normalizeCustomerPhone(row.phone) === phone).length > 1;
  }
  const email = normalizeCustomerEmail(lead.email);
  return Boolean(
    email && leads.filter((row) => normalizeCustomerEmail(row.email) === email).length > 1
  );
}

export function hasExactBookedTrial(
  lead: { phone?: unknown; email?: unknown },
  trials: Array<{
    phone?: unknown;
    status: string;
    calendly_details?: { email?: unknown } | null;
  }>
): boolean {
  const phone = normalizeCustomerPhone(lead.phone);
  const email = normalizeCustomerEmail(lead.email);
  return trials.some((trial) => {
    if (trial.status !== "booked" && trial.status !== "scheduled") return false;
    const phoneMatch = Boolean(
      phone && normalizeCustomerPhone(trial.phone) === phone
    );
    const emailMatch = Boolean(
      email && normalizeCustomerEmail(trial.calendly_details?.email) === email
    );
    return phoneMatch || emailMatch;
  });
}

export function decideSilenceTimeout(input: {
  status: LeadLifecycleStatus;
  nowMs: number;
  createdAt: string;
  latestCustomerInboundAt?: string | null;
  latestLifecycleAt?: string | null;
  identityAmbiguous: boolean;
  hasBookedTrial: boolean;
}): SilenceSweepDecision {
  if (input.status !== "new" && input.status !== "contacted") {
    return { eligible: false, reason: "stage_protected" };
  }
  if (input.identityAmbiguous) return { eligible: false, reason: "identity_ambiguous" };
  if (input.hasBookedTrial) return { eligible: false, reason: "booked_trial" };

  const inboundMs = Date.parse(input.latestCustomerInboundAt || input.createdAt);
  const lifecycleMs = input.latestLifecycleAt ? Date.parse(input.latestLifecycleAt) : Number.NaN;
  if (!Number.isFinite(inboundMs)) return { eligible: false, reason: "invalid_activity_time" };

  // Customer inbound is authoritative. Lead creation is used only when no
  // tracked inbound exists. Later lifecycle work restarts the same 48h clock,
  // so a recently handled lead cannot be swept based on an older message.
  const quietSinceMs = Number.isFinite(lifecycleMs) ? Math.max(inboundMs, lifecycleMs) : inboundMs;
  const eligibleAtMs = quietSinceMs + LEAD_QUIET_PERIOD_MS;
  if (input.nowMs < eligibleAtMs) {
    return {
      eligible: false,
      reason: "quiet_period_not_elapsed",
      eligibleAt: new Date(eligibleAtMs).toISOString(),
    };
  }
  return {
    eligible: true,
    reason: "eligible",
    quietSince: new Date(quietSinceMs).toISOString(),
    eligibleAt: new Date(eligibleAtMs).toISOString(),
  };
}
