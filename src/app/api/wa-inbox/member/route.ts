// POST /api/wa-inbox/member { phone, is_member } — master_admin only.
// Sets jai.leads.is_member for the contact. When true, JAI treats them as a
// KNOWN existing member (member-mode greeting, never the trial link) on every
// message regardless of wording — see the whatsapp webhook + generateReply(isMember).
// This is the manual "confirm this texter is a member" control; JAI also
// auto-sets it when it infers [MEMBER] from the conversation.
import { NextRequest, NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let payload: { phone?: string; is_member?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phone = (payload.phone || "").replace(/^\+/, "").trim();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });
  if (typeof payload.is_member !== "boolean") {
    return NextResponse.json({ error: "is_member must be boolean" }, { status: 400 });
  }

  const { error } = await createJaiClient()
    .from("leads")
    .upsert({ contact_number: phone, is_member: payload.is_member }, { onConflict: "contact_number" });

  if (error) {
    console.error("[wa-inbox member] upsert failed", error);
    return NextResponse.json({ error: "Toggle failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, phone, is_member: payload.is_member });
}
