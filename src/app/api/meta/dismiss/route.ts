// POST /api/meta/dismiss — master_admin (Jeremy) only.
// Marks a comment OR DM dismissed. Body: { id, kind?: "comment" | "dm" }.
import { NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, kind } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const sb = createJaiClient();
  const table = kind === "dm" ? "meta_dms" : "meta_comments";
  await sb
    .from(table)
    .update({ status: "dismissed", replied_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
