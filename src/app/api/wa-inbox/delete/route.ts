// POST /api/wa-inbox/delete { phone } — master_admin only.
// Wipes a contact's JAI conversation history + lead row so the next message from
// them is treated as a brand-new contact (fresh greeting, AI un-paused). Used to
// reset test threads from the inbox without editing the DB by hand.
import { NextRequest, NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let payload: { phone?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phone = (payload.phone || "").replace(/^\+/, "").trim();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const jai = createJaiClient();
  const { error: convErr } = await jai.from("conversations").delete().eq("contact_number", phone);
  if (convErr) {
    console.error("[wa-inbox delete] conversations delete failed", convErr);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  // Remove the lead row too so ai_paused / is_member reset — the next inbound
  // message re-creates it fresh.
  const { error: leadErr } = await jai.from("leads").delete().eq("contact_number", phone);
  if (leadErr) {
    console.error("[wa-inbox delete] lead delete failed", leadErr);
    return NextResponse.json({ error: "History cleared, but lead reset failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, phone });
}
