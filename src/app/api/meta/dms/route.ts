// GET /api/meta/dms — master_admin (Jeremy) only.
// Returns pending DMs (enquiries awaiting a reply) + recently handled ones, from
// jai.meta_dms. Fast read; ingestion happens in /api/meta/refresh.
import { NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createJaiClient();
  const cols =
    "id, platform, conversation_id, participant_id, participant_name, last_user_message, last_message_at, draft_reply, status, replied_text, replied_at";

  const [pendingRes, doneRes] = await Promise.all([
    sb
      .from("meta_dms")
      .select(cols)
      .eq("status", "pending")
      .order("last_message_at", { ascending: false })
      .limit(200),
    sb
      .from("meta_dms")
      .select(cols)
      .in("status", ["replied", "dismissed"])
      .order("replied_at", { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({
    pending: pendingRes.data || [],
    done: doneRes.data || [],
  });
}
