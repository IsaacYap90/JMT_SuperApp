// POST /api/meta/reply — master_admin (Jeremy) only.
// Posts an (approved, possibly edited) reply to a FB/IG comment OR DM, then marks
// the row replied. Body: { id, message, kind?: "comment" | "dm" }.
import { NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";
import { postReply } from "@/lib/meta/comments";
import { postDmReply } from "@/lib/meta/dms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, message, kind } = await req.json().catch(() => ({}));
  if (!id || !message || !message.trim()) {
    return NextResponse.json({ error: "Missing id or message" }, { status: 400 });
  }
  const text = message.trim();
  const sb = createJaiClient();

  if (kind === "dm") {
    const { data: row } = await sb
      .from("meta_dms")
      .select("id, participant_id, status")
      .eq("id", id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = row as { id: string; participant_id: string | null; status: string };
    if (!r.participant_id) return NextResponse.json({ error: "No recipient id" }, { status: 400 });

    const result = await postDmReply(r.participant_id, text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Send failed" }, { status: 502 });
    }
    await sb
      .from("meta_dms")
      .update({ status: "replied", replied_text: text, replied_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // Default: comment reply.
  const { data: row } = await sb
    .from("meta_comments")
    .select("id, platform, comment_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = row as { id: string; platform: "facebook" | "instagram"; comment_id: string; status: string };
  if (r.status === "replied") {
    return NextResponse.json({ error: "Already replied" }, { status: 409 });
  }

  const result = await postReply(r.platform, r.comment_id, text);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Send failed" }, { status: 502 });
  }
  await sb
    .from("meta_comments")
    .update({ status: "replied", replied_text: text, replied_at: new Date().toISOString() })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
