// POST /api/wa-inbox/pause { phone, paused } — master_admin only.
// Sets jai.leads.ai_paused for the contact. When paused, the bot skips the AI
// auto-reply so Jeremy can take over the thread.
import { NextRequest, NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { isMasterAdmin } from "@/lib/wa-inbox-guard";
import {
  buildPauseMetadata,
  clearPauseMetadata,
  isMissingPauseMetadataColumn,
} from "@/lib/wa/pause-metadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let payload: { phone?: string; paused?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phone = (payload.phone || "").replace(/^\+/, "").trim();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });
  if (typeof payload.paused !== "boolean") {
    return NextResponse.json({ error: "paused must be boolean" }, { status: 400 });
  }

  const jai = createJaiClient();
  const metadata = payload.paused
    ? buildPauseMetadata({
        pausedBy: "coach_jeremy",
        source: "inbox_manual",
        reason: "Coach Jeremy took over from the WhatsApp inbox",
      })
    : clearPauseMetadata();
  let { error } = await jai
    .from("leads")
    .upsert({ contact_number: phone, ...metadata }, { onConflict: "contact_number" });

  // Safe rolling deploy: if code reaches an environment before the additive
  // migration, preserve the existing pause behaviour and omit metadata only.
  if (error && isMissingPauseMetadataColumn(error)) {
    const legacy = await jai
      .from("leads")
      .upsert({ contact_number: phone, ai_paused: payload.paused }, { onConflict: "contact_number" });
    error = legacy.error;
  }

  if (error) {
    console.error("[wa-inbox pause] upsert failed", error);
    return NextResponse.json({ error: "Toggle failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, phone, paused: payload.paused });
}
