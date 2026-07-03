// GET /api/meta/comments — master_admin (Jeremy) only.
// Returns pending comments (need a reply) + recently handled ones (the activity log),
// from jai.meta_comments. Fast read; ingestion happens in /api/meta/refresh.
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
    "id, platform, comment_id, post_caption, permalink, author_name, author_username, comment_text, comment_created_at, draft_reply, status, replied_text, replied_at";

  const [pendingRes, doneRes] = await Promise.all([
    sb
      .from("meta_comments")
      .select(cols)
      .eq("status", "pending")
      .order("comment_created_at", { ascending: false })
      .limit(200),
    sb
      .from("meta_comments")
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
