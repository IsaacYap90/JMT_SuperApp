import { canonicalCustomerIdentifiers } from "../customer-identity";

export type CustomerSource = "public.leads" | "public.trial_bookings" | "jai.leads";

export type CustomerIdentityRecord = {
  source: CustomerSource;
  sourceKey: string;
  name?: string | null;
  phone?: unknown;
  email?: unknown;
};

export type CustomerResolution =
  | { status: "resolved"; matchedBy: "phone" | "email"; normalizedValue: string; records: CustomerIdentityRecord[] }
  | { status: "ambiguous"; matchedBy: "phone" | "email"; normalizedValue: string; records: CustomerIdentityRecord[]; reason: string }
  | { status: "unmatched"; records: CustomerIdentityRecord[]; reason: string };

function duplicateWithinSource(records: CustomerIdentityRecord[]): boolean {
  const counts = new Map<CustomerSource, number>();
  for (const record of records) counts.set(record.source, (counts.get(record.source) ?? 0) + 1);
  return Array.from(counts.values()).some((count) => count > 1);
}

export function resolveExactCustomer(
  anchor: CustomerIdentityRecord,
  candidates: CustomerIdentityRecord[]
): CustomerResolution {
  const anchorIds = canonicalCustomerIdentifiers(anchor);
  const attempts: Array<{ kind: "phone" | "email"; value: string | null }> = [
    { kind: "phone", value: anchorIds.phoneE164 },
    { kind: "email", value: anchorIds.emailNormalized },
  ];

  for (const attempt of attempts) {
    if (!attempt.value) continue;
    const matches = candidates.filter((candidate) => {
      const ids = canonicalCustomerIdentifiers(candidate);
      return attempt.kind === "phone"
        ? ids.phoneE164 === attempt.value
        : ids.emailNormalized === attempt.value;
    });
    const externalMatches = matches.filter(
      (candidate) => candidate.source !== anchor.source || candidate.sourceKey !== anchor.sourceKey
    );
    // The selected row always matches itself. That alone is not a resolution:
    // continue to email, then return unmatched if neither identifier connects
    // another source row.
    if (externalMatches.length === 0) continue;
    if (duplicateWithinSource(matches)) {
      return {
        status: "ambiguous",
        matchedBy: attempt.kind,
        normalizedValue: attempt.value,
        records: matches,
        reason: `exact ${attempt.kind} matches more than one row in the same source`,
      };
    }
    return {
      status: "resolved",
      matchedBy: attempt.kind,
      normalizedValue: attempt.value,
      records: matches,
    };
  }

  return { status: "unmatched", records: [anchor], reason: "no safe exact phone or email match" };
}

export type CustomerTimelineEvent = {
  id: string;
  at: string;
  source: CustomerSource | "jai.conversations";
  title: string;
  detail?: string | null;
};

export function chronologicalTimeline(events: CustomerTimelineEvent[]): CustomerTimelineEvent[] {
  return [...events].sort((a, b) => {
    const delta = Date.parse(a.at) - Date.parse(b.at);
    return delta || a.id.localeCompare(b.id);
  });
}

/** Raw jai.leads keys to use for conversation reads. Never reconstruct these
 * from E.164: historical rows may retain a different exact storage format. */
export function conversationContactKeys(
  anchor: CustomerIdentityRecord,
  selectedRecords: CustomerIdentityRecord[],
  limit = 20
): string[] {
  const records = anchor.source === "jai.leads"
    ? [...selectedRecords, anchor]
    : selectedRecords;
  return Array.from(new Set(
    records
      .filter((record) => record.source === "jai.leads")
      .map((record) => record.sourceKey.trim())
      .filter(Boolean)
  )).slice(0, Math.max(0, limit));
}

export function buildCustomerLinkPlan(resolution: CustomerResolution) {
  if (resolution.status !== "resolved") return null;
  return {
    matchedBy: resolution.matchedBy,
    normalizedValue: resolution.normalizedValue,
    sourceLinks: resolution.records.map((record) => ({
      sourceSchema: record.source.startsWith("jai.") ? "jai" : "public",
      sourceTable: record.source.split(".")[1],
      sourceKey: record.sourceKey,
    })),
  };
}
