// POST /api/meta/refresh — master_admin (Jeremy) only.
// Polls Facebook + Instagram for recent comments on the gym's posts, upserts new
// ones into jai.meta_comments, and generates a JAI draft reply for each new one.
// Also callable by a cron. Idempotent: existing comments are ignored on conflict.
import { NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";
import { fetchAllComments } from "@/lib/meta/comments";
import { fetchAllDMs } from "@/lib/meta/dms";
import { generateCommentDraft, generateDmDraft } from "@/lib/meta/draft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Cap how many drafts we generate per call so one refresh can't run away.
const DRAFT_BATCH = 25;

export async function POST() {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createJaiClient();

  let ingested = 0;
  try {
    const comments = await fetchAllComments();
    if (comments.length > 0) {
      // Insert new comments only; existing comment_ids are left untouched.
      const { data } = await sb
        .from("meta_comments")
        .upsert(comments, { onConflict: "comment_id", ignoreDuplicates: true })
        .select("id");
      ingested = data?.length || 0;
    }
  } catch (err) {
    console.error("[meta-refresh] fetch/upsert failed", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }

  // Draft replies for pending comments that don't have one yet.
  let drafted = 0;
  const { data: needDraft } = await sb
    .from("meta_comments")
    .select("id, platform, post_caption, comment_text, author_name")
    .eq("status", "pending")
    .is("draft_reply", null)
    .order("comment_created_at", { ascending: false })
    .limit(DRAFT_BATCH);

  for (const row of needDraft || []) {
    const r = row as {
      id: string;
      platform: "facebook" | "instagram";
      post_caption: string | null;
      comment_text: string | null;
      author_name: string | null;
    };
    const draft = await generateCommentDraft(r.platform, r.post_caption, r.comment_text, r.author_name);
    if (draft) {
      await sb.from("meta_comments").update({ draft_reply: draft }).eq("id", r.id);
      drafted++;
    } else {
      // Not a training enquiry (praise/tag/emoji/spam) — auto-skip so it never
      // clutters Jeremy's inbox. Only PT + group-class enquiries stay pending.
      await sb.from("meta_comments").update({ status: "skipped" }).eq("id", r.id);
    }
  }

  // ── DMs (FB Messenger + IG Direct) — same enquiry-only draft-for-approval ──
  // fetchAllDMs() only returns conversations whose LATEST message is from the
  // customer (i.e. awaiting a reply). We insert new threads, and RE-OPEN an
  // existing thread only when a genuinely newer customer message arrived — so a
  // dismissed/replied thread stays put unless the customer writes again.
  let dmIngested = 0;
  try {
    const dms = await fetchAllDMs();
    if (dms.length > 0) {
      const ids = dms.map((d) => d.conversation_id);
      const { data: existingRows } = await sb
        .from("meta_dms")
        .select("conversation_id, last_message_at")
        .in("conversation_id", ids);
      const existing = new Map(
        (existingRows || []).map((r) => [
          (r as { conversation_id: string }).conversation_id,
          (r as { last_message_at: string | null }).last_message_at,
        ])
      );
      for (const dm of dms) {
        const prevAt = existing.get(dm.conversation_id);
        if (prevAt === undefined) {
          await sb.from("meta_dms").insert(dm);
          dmIngested++;
        } else if (dm.last_message_at && dm.last_message_at !== prevAt) {
          // Newer customer message → re-open for a fresh reply.
          await sb
            .from("meta_dms")
            .update({
              participant_id: dm.participant_id,
              participant_name: dm.participant_name,
              last_user_message: dm.last_user_message,
              last_message_at: dm.last_message_at,
              status: "pending",
              draft_reply: null,
            })
            .eq("conversation_id", dm.conversation_id);
          dmIngested++;
        }
      }
    }
  } catch (err) {
    console.error("[meta-refresh] DM fetch/upsert failed", err);
  }

  let dmDrafted = 0;
  const { data: dmNeedDraft } = await sb
    .from("meta_dms")
    .select("id, platform, last_user_message, participant_name")
    .eq("status", "pending")
    .is("draft_reply", null)
    .order("last_message_at", { ascending: false })
    .limit(DRAFT_BATCH);

  for (const row of dmNeedDraft || []) {
    const r = row as {
      id: string;
      platform: "facebook" | "instagram";
      last_user_message: string | null;
      participant_name: string | null;
    };
    const draft = await generateDmDraft(r.platform, r.last_user_message, r.participant_name);
    if (draft) {
      await sb.from("meta_dms").update({ draft_reply: draft }).eq("id", r.id);
      dmDrafted++;
    } else {
      await sb.from("meta_dms").update({ status: "skipped" }).eq("id", r.id);
    }
  }

  return NextResponse.json({ ingested, drafted, dmIngested, dmDrafted });
}
