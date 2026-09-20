// GET /api/wa-inbox/messages — master_admin only.
// Reads the JAI AI assistant's `jai.conversations` (grouped per contact) + merges the
// per-contact `ai_paused` flag from `jai.leads`. Returns an empty list when
// there's no live data yet — real chats arrive once the bot webhook is live.
import { NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";
import { isMissingPauseMetadataColumn } from "@/lib/wa/pause-metadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  id: string;
  contact_number: string;
  contact_name: string | null;
  role: "user" | "assistant";
  message: string;
  via: string | null;
  created_at: string;
};

export async function GET() {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createJaiClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, contact_number, contact_name, role, message, via, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  // No live data yet → empty inbox (real chats arrive once the bot webhook is live).
  if (error || !data || data.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  type Lead = {
    contact_number: string;
    contact_name: string | null;
    ai_paused: boolean | null;
    is_member: boolean | null;
    ai_paused_at?: string | null;
    ai_paused_by?: string | null;
    ai_pause_source?: string | null;
    ai_pause_reason?: string | null;
    ai_pause_expires_at?: string | null;
  };
  const expanded = await supabase
    .from("leads")
    .select("contact_number, contact_name, ai_paused, is_member, ai_paused_at, ai_paused_by, ai_pause_source, ai_pause_reason, ai_pause_expires_at");
  let leadRows = expanded.data as unknown as Lead[] | null;
  let leadError = expanded.error;
  if (leadError && isMissingPauseMetadataColumn(leadError)) {
    const legacy = await supabase
      .from("leads")
      .select("contact_number, contact_name, ai_paused, is_member");
    leadRows = legacy.data as unknown as Lead[] | null;
    leadError = legacy.error;
  }
  if (leadError) console.error("[wa-inbox messages] lead metadata read failed", leadError);
  const leadByPhone = new Map<string, Lead>();
  for (const l of (leadRows || []) as Lead[]) leadByPhone.set(l.contact_number, l);

  const byPhone = new Map<string, Row[]>();
  for (const m of (data || []) as Row[]) {
    if (!byPhone.has(m.contact_number)) byPhone.set(m.contact_number, []);
    byPhone.get(m.contact_number)!.push(m);
  }

  const conversations = Array.from(byPhone.entries()).map(([phone, msgs]) => {
    const sorted = [...msgs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const last = sorted[sorted.length - 1];
    const lead = leadByPhone.get(phone);
    const name =
      lead?.contact_name || sorted.find((m) => m.contact_name)?.contact_name || null;
    return {
      phone,
      name,
      last_ts: last.created_at,
      last_body: last.message,
      last_role: last.role,
      paused: !!lead?.ai_paused,
      pausedAt: lead?.ai_paused_at ?? null,
      pausedBy: lead?.ai_paused_by ?? null,
      pauseSource: lead?.ai_pause_source ?? null,
      pauseReason: lead?.ai_pause_reason ?? null,
      pauseExpiresAt: lead?.ai_pause_expires_at ?? null,
      isMember: !!lead?.is_member,
      messages: sorted.map((m) => ({ id: m.id, role: m.role, body: m.message, via: m.via, ts: m.created_at })),
    };
  });

  conversations.sort((a, b) => new Date(b.last_ts).getTime() - new Date(a.last_ts).getTime());
  return NextResponse.json({ conversations });
}
