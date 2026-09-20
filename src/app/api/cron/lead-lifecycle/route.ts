import { NextRequest, NextResponse } from "next/server";
import { normalizeCustomerPhone } from "@/lib/customer-identity";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  decideSilenceTimeout,
  hasAmbiguousLeadIdentity,
  hasExactBookedTrial,
  type SilenceSweepReason,
} from "@/lib/leads/lifecycle-sweep";
import { transitionLeadStage } from "@/lib/leads/lifecycle-service";
import type { LeadLifecycleStatus } from "@/lib/leads/lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createJaiClient } from "@/lib/supabase/jai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 1000;

type QueryError = { message: string } | null;
type LeadRow = {
  id: string;
  status: LeadLifecycleStatus;
  phone: string | null;
  email: string | null;
  created_at: string;
};
type TrialRow = {
  phone: string | null;
  status: string;
  calendly_details: { email?: string | null } | null;
};
type EventRow = { lead_id: string; created_at: string };
type ConversationRow = { contact_number: string | null; created_at: string };

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: QueryError }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function latestByPhone(rows: ConversationRow[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const phone = normalizeCustomerPhone(row.contact_number);
    if (!phone || !row.created_at) continue;
    const previous = latest.get(phone);
    if (!previous || Date.parse(row.created_at) > Date.parse(previous)) latest.set(phone, row.created_at);
  }
  return latest;
}

function latestByLead(rows: EventRow[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const previous = latest.get(row.lead_id);
    if (!previous || Date.parse(row.created_at) > Date.parse(previous)) latest.set(row.lead_id, row.created_at);
  }
  return latest;
}

// Vercel cron expressions are UTC. `0 * * * *` runs once at the top of every
// hour; eligibility itself uses exact timestamps, including the 48:00 boundary.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase service configuration missing" }, { status: 503 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const nowMs = Date.now();
  const db = createAdminClient();
  const jai = createJaiClient();

  try {
    const [leads, trials, events, conversations] = await Promise.all([
      fetchAll<LeadRow>(async (from, to) => {
        const { data, error } = await db
          .from("leads")
          .select("id, status, phone, email, created_at")
          .order("id", { ascending: true })
          .range(from, to);
        return { data: data as LeadRow[] | null, error };
      }),
      fetchAll<TrialRow>(async (from, to) => {
        const { data, error } = await db
          .from("trial_bookings")
          .select("phone, status, calendly_details")
          .order("id", { ascending: true })
          .range(from, to);
        return { data: data as TrialRow[] | null, error };
      }),
      fetchAll<EventRow>(async (from, to) => {
        const { data, error } = await db
          .from("lead_stage_events")
          .select("lead_id, created_at")
          .order("id", { ascending: true })
          .range(from, to);
        return { data: data as EventRow[] | null, error };
      }),
      fetchAll<ConversationRow>(async (from, to) => {
        const { data, error } = await jai
          .from("conversations")
          .select("contact_number, created_at")
          .eq("role", "user")
          .order("created_at", { ascending: true })
          .range(from, to);
        return { data: data as ConversationRow[] | null, error };
      }),
    ]);

    const inboundByPhone = latestByPhone(conversations);
    const lifecycleByLead = latestByLead(events);
    const reasonCounts: Record<SilenceSweepReason, number> = {
      eligible: 0,
      stage_protected: 0,
      identity_ambiguous: 0,
      booked_trial: 0,
      quiet_period_not_elapsed: 0,
      invalid_activity_time: 0,
    };
    const outcomes: Record<string, number> = {};
    const report: Array<{
      leadId: string;
      reason: SilenceSweepReason;
      outcome?: string;
      eligibleAt?: string;
    }> = [];

    for (const lead of leads) {
      const phone = normalizeCustomerPhone(lead.phone);
      const decision = decideSilenceTimeout({
        status: lead.status,
        nowMs,
        createdAt: lead.created_at,
        latestCustomerInboundAt: phone ? inboundByPhone.get(phone) : null,
        latestLifecycleAt: lifecycleByLead.get(lead.id),
        identityAmbiguous: hasAmbiguousLeadIdentity(lead, leads),
        hasBookedTrial: hasExactBookedTrial(lead, trials),
      });
      reasonCounts[decision.reason] += 1;

      if (!decision.eligible) {
        report.push({ leadId: lead.id, reason: decision.reason, eligibleAt: decision.eligibleAt });
        continue;
      }

      let outcome = "dry_run";
      if (!dryRun) {
        outcome = await transitionLeadStage({
          leadId: lead.id,
          to: "lost",
          trigger: "silence_timeout",
          source: {
            schema: "public",
            table: "leads",
            key: `48h:${decision.quietSince}`,
          },
          actor: { type: "system" },
          automatic: true,
          metadata: {
            quiet_since: decision.quietSince,
            eligible_at: decision.eligibleAt,
            quiet_hours: 48,
          },
        });
      }
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      report.push({ leadId: lead.id, reason: decision.reason, outcome, eligibleAt: decision.eligibleAt });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      evaluatedAt: new Date(nowMs).toISOString(),
      quietHours: 48,
      counts: { total: leads.length, reasons: reasonCounts, outcomes },
      report,
    });
  } catch (error) {
    console.error("[lead-lifecycle cron] sweep failed", error);
    return NextResponse.json({ error: "Lifecycle sweep failed" }, { status: 500 });
  }
}
