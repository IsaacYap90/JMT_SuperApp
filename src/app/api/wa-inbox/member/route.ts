// POST /api/wa-inbox/member { phone, is_member } — master_admin only.
// Marks a contact as an existing member (or unmarks) on jai.leads so JAI stops
// treating them as a new lead. Upserts the row by contact_number, setting only
// is_member — contact_name (if any) is preserved (PostgREST merge-duplicates only
// updates the columns in the payload).
import { NextRequest, NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let payload: { phone?: string; contact_number?: string; is_member?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const contact_number = (payload.contact_number || payload.phone || "").replace(/^\+/, "").trim();
  const is_member = !!payload.is_member;
  if (!contact_number) return NextResponse.json({ error: "contact_number required" }, { status: 400 });

  const { error } = await createJaiClient()
    .from("leads")
    .upsert({ contact_number, is_member }, { onConflict: "contact_number" });
  if (error) {
    console.error("[wa-inbox member] upsert failed", error);
    return NextResponse.json({ error: "Failed to update member status", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, is_member });
}
