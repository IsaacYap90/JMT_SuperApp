/** Pure lead lifecycle rules. No database writes or external events live here. */

export type LeadLifecycleStatus = "new" | "contacted" | "scheduled" | "showed" | "won" | "lost";

export type LeadTransitionTrigger =
  | "manual"
  | "outbound_contact"
  | "trial_scheduled"
  | "trial_outcome"
  | "membership_confirmed"
  | "reopened"
  | "silence_timeout"
  | "backfill";

const ALLOWED: Record<LeadLifecycleStatus, readonly LeadLifecycleStatus[]> = {
  // A person can book before an outbound reply, so new -> scheduled is valid.
  new: ["contacted", "scheduled", "lost"],
  contacted: ["scheduled", "won", "lost"],
  scheduled: ["showed", "won", "lost"],
  showed: ["won", "lost"],
  won: [],
  // A previously lost lead may restart the conversation or book later.
  lost: ["contacted", "scheduled", "won"],
};

const AUTOMATIC_TARGETS = new Set<LeadLifecycleStatus>(["contacted", "scheduled", "showed"]);

export type LeadTransitionDecision =
  | { kind: "apply"; from: LeadLifecycleStatus; to: LeadLifecycleStatus }
  | { kind: "noop"; status: LeadLifecycleStatus; reason: "already_at_target" }
  | { kind: "reject"; from: LeadLifecycleStatus; to: LeadLifecycleStatus; reason: "transition_not_allowed" };

export function decideLeadTransition(
  from: LeadLifecycleStatus,
  to: LeadLifecycleStatus
): LeadTransitionDecision {
  if (from === to) return { kind: "noop", status: from, reason: "already_at_target" };
  if (ALLOWED[from].includes(to)) return { kind: "apply", from, to };
  return { kind: "reject", from, to, reason: "transition_not_allowed" };
}

export function allowedLeadTargets(from: LeadLifecycleStatus): readonly LeadLifecycleStatus[] {
  return ALLOWED[from];
}

export function decideAutomaticLeadTransition(
  from: LeadLifecycleStatus,
  to: LeadLifecycleStatus,
  trigger?: LeadTransitionTrigger
): LeadTransitionDecision {
  if (from === to) return decideLeadTransition(from, to);
  // Lost is automated only by the reviewed 48-hour silence sweep. Keeping the
  // trigger check here prevents any other caller from accidentally marking a
  // lead lost just because the base lifecycle permits it.
  if (to === "lost" && trigger === "silence_timeout") {
    if (from === "new" || from === "contacted") return decideLeadTransition(from, to);
    return { kind: "reject", from, to, reason: "transition_not_allowed" };
  }
  if (!AUTOMATIC_TARGETS.has(to)) {
    return { kind: "reject", from, to, reason: "transition_not_allowed" };
  }
  return decideLeadTransition(from, to);
}

/** Manual admin changes preserve the existing UI's freedom. */
export function decideManualLeadTransition(
  from: LeadLifecycleStatus,
  to: LeadLifecycleStatus
): LeadTransitionDecision {
  if (from === to) return { kind: "noop", status: from, reason: "already_at_target" };
  return { kind: "apply", from, to };
}

/** Stable event key for a future lifecycle store/outbox. */
export function leadTransitionIdempotencyKey(input: {
  leadId: string;
  to: LeadLifecycleStatus;
  trigger: LeadTransitionTrigger;
  sourceRecordId: string;
}): string {
  const parts = [input.leadId, input.to, input.trigger, input.sourceRecordId].map((part) =>
    encodeURIComponent(part.trim())
  );
  return `lead-transition:${parts.join(":")}`;
}
