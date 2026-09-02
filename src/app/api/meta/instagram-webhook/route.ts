// JAI on Instagram Direct — inbound DM webhook.
//
// GET  /api/meta/instagram-webhook  → Meta handshake verification
// POST /api/meta/instagram-webhook  → inbound IG DM → log → JAI reply → send.
//
// WHY THIS EXISTS: on 2026-09-02 a real prospect DMed the gym on Instagram
// ("I'm quite interested in trying out Muay Thai, is there any packages I can
// check out? I'm a beginner") and got Business Suite's generic auto-reply. JAI
// never saw it, because the "JMT AI Bot" app (1666435701309531) had exactly ONE
// webhook subscription: whatsapp_business_account → messages. Instagram DMs have
// never reached JMT OS. This route is the missing half; the Meta-side half a
// human must do is in docs/instagram-dm-setup.md.
//
// STRUCTURE deliberately mirrors src/app/api/whatsapp/webhook/route.ts: verify
// the raw body first and fail closed, two-phase dedupe that fails OPEN, log the
// conversation, answer from the SAME fact sheet via the SAME generateReply(),
// and run the SAME outbound money / dead-link guards.
import { NextRequest, NextResponse } from "next/server";
import { createJaiClient } from "@/lib/supabase/jai";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { verifyMetaSignature } from "@/lib/meta-webhook";
import { generateReply, type Escalation } from "@/lib/wa/jai-reply";
import { buildContactContext } from "@/lib/wa/member-lookup";
import { buildDeterministicAnswer, lateArrivalAnswer } from "@/lib/wa/deterministic-answers";
import { getJaiFacts } from "@/lib/wa/jai-facts";
import {
  detectJoinIntent,
  hasDisallowedPrice,
  hasDeadAdultLink,
  inboundHasUnknownFigure,
  JOIN_HANDOFF_TEXT,
  JOIN_HANDOFF_SUFFIX,
  PAUSED_ADULT_TRIAL_TEXT,
} from "@/lib/wa/join-intent";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";
import { postDmReply } from "@/lib/meta/dms";
import {
  extractInstagramMessages,
  isOurOwnId,
  describeSendError,
  type IgInbound,
} from "@/lib/meta/ig-messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Verify token for the GET handshake. Its OWN env var, not WA_VERIFY_TOKEN:
// Meta stores one callback URL + verify token per subscription, and reusing the
// WhatsApp one would mean re-subscribing IG rotates the WhatsApp secret too.
// No literal fallback — an unset token must fail the handshake, never pass it.
const VERIFY_TOKEN = () => (process.env.IG_VERIFY_TOKEN || "").trim();

// Instagram DMs live in jai.conversations under a namespaced key so JAI gets
// real thread history from the same table the WhatsApp bot uses.
//
// The `ig:` prefix is load-bearing, not cosmetic. jai.conversations is keyed by
// contact_number and everything downstream treats that as a PHONE NUMBER:
// /api/wa-inbox/send WhatsApp-delivers to it, and the lead-followup cron
// WhatsApp-nudges every jai.leads row. An unprefixed IGSID there would be a
// WhatsApp send to a 17-digit non-number.
// For the same reason this route NEVER writes jai.leads — no cron can then pick
// an Instagram thread up and try to WhatsApp it.
const igKey = (igsid: string) => `ig:${igsid}`;

// Global kill switch. Auto-replying on a brand-new channel, on the strength of
// code nobody has yet seen answer a real Instagram message, is not something to
// switch on by deploying. Unset/anything-but-1 → JAI stays silent, but the DM is
// still logged and Jeremy still gets the Telegram ping (which alone fixes the
// 2026-09-02 failure: the message reached nobody).
const autoReplyEnabled = () => /^(1|true|yes)$/i.test(process.env.JAI_IG_AUTOREPLY || "");

// ── Handshake ────────────────────────────────────────────────────────────────
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = (p.get("hub.verify_token") || "").trim();
  const challenge = p.get("hub.challenge") || "";
  const expected = VERIFY_TOKEN();
  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// ── Inbound DM ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Signature on the RAW body BEFORE parsing, fail closed. Instagram DMs are
  // signed by the SAME app as WhatsApp ("JMT AI Bot"), so META_APP_SECRET is
  // correct here — unlike Lead Ads, which is a different app and different
  // secret (the 2026-07-20 outage; see src/lib/meta-webhook.ts).
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed so Meta doesn't retry
  }

  const events = extractInstagramMessages(body);
  // Meta batches up to 1000 updates per POST and does NOT guarantee batching,
  // so handle each one; echoes/reads/reactions are already filtered out.
  for (const ev of events) {
    try {
      await handleOne(ev);
    } catch (err) {
      console.error("[jai-ig-webhook] handler error", err);
    }
  }
  return NextResponse.json({ ok: true }); // always ack — Meta retries for 36h
}

async function handleOne(ev: IgInbound) {
  if (isOurOwnId(ev.senderId)) return; // our own account, never a customer
  const contact = igKey(ev.senderId);
  const sb = createJaiClient();

  // ── Idempotency — same TWO-PHASE claim as the WhatsApp route, and it FAILS
  // OPEN for the same reason: Meta retries immediately and then for 36 hours,
  // and we only suppress a retry when we can POSITIVELY confirm a reply already
  // went out (row exists AND handled=true). A DB error, or a row claimed but
  // never marked handled (a prior attempt died mid-send), means we re-handle.
  // handled=true is set only AFTER a successful Instagram send.
  // Reuses jai.processed_messages: the column is wa_message_id but it is just a
  // unique message id, and an IG `mid` never collides with a WhatsApp `wamid`.
  const markHandled = async () => {
    const { error } = await sb
      .from("processed_messages")
      .update({ handled: true })
      .eq("wa_message_id", ev.messageId);
    if (error) console.error("[jai-ig-webhook] markHandled failed", error);
  };

  const { error: claimErr } = await sb
    .from("processed_messages")
    .insert({ wa_message_id: ev.messageId });
  if (claimErr) {
    if (claimErr.code === "23505") {
      const { data: existing } = await sb
        .from("processed_messages")
        .select("handled")
        .eq("wa_message_id", ev.messageId)
        .maybeSingle();
      if (existing?.handled === true) return; // confirmed duplicate
      // Claimed but never confirmed → fail open, re-handle.
    } else {
      console.error("[jai-ig-webhook] dedup claim failed, proceeding", claimErr);
    }
  }

  // History BEFORE this message (newest-first then reversed — the WhatsApp
  // route's fix: ascending+limit returns the OLDEST twenty, i.e. no recent
  // context at all for a returning customer).
  const { data: priorDesc } = await sb
    .from("conversations")
    .select("role, message, created_at")
    .eq("contact_number", contact)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(20);
  const prior = (priorDesc || []).slice().reverse();
  const isNewContact = prior.length === 0;

  const text = ev.text;
  const sentAt = new Date(ev.timestamp ?? Date.now()).toISOString();

  // Log the inbound message (media-only DMs are logged as a placeholder so the
  // thread reads correctly and Jeremy can see something arrived).
  await sb.from("conversations").insert({
    contact_number: contact,
    contact_name: null, // the messages webhook carries no username — see the doc
    role: "user",
    message: text ?? "[Instagram: photo / video / voice — no text]",
  });

  // Mirror the thread into jai.meta_dms so it appears in the EXISTING Meta
  // assistant tab, where Jeremy already has a working reply button that posts
  // through the same postDmReply() send path. No new table, no schema change.
  // limit(1) rather than maybeSingle(): maybeSingle() ERRORS if two rows share
  // the conversation_id, and we would then insert a third.
  const { data: dmRows } = await sb
    .from("meta_dms")
    .select("id, status")
    .eq("conversation_id", contact)
    .order("last_message_at", { ascending: false })
    .limit(1);
  const dmRow = dmRows?.[0] as { id: string; status: string } | undefined;
  if (dmRow) {
    await sb
      .from("meta_dms")
      .update({
        last_user_message: text,
        last_message_at: sentAt,
        // A thread Jeremy DISMISSED is his — don't drag it back to pending.
        ...(dmRow.status === "dismissed" ? {} : { status: "pending", draft_reply: null }),
      })
      .eq("id", dmRow.id);
  } else {
    await sb.from("meta_dms").insert({
      platform: "instagram",
      conversation_id: contact,
      participant_id: ev.senderId,
      participant_name: null,
      last_user_message: text,
      last_message_at: sentAt,
      status: "pending",
    });
  }

  // Ping Jeremy at the start of each conversation burst (first inbound after
  // 30+ quiet minutes). This alone is the fix for 2026-09-02 — the DM reached
  // nobody. It runs even when auto-reply is off or the thread is dismissed.
  await pingAdmins(await burstNote(sb, contact, text, ev.senderId), "jai-ig-inbox");

  // ── Reasons to stay quiet ────────────────────────────────────────────────
  // Each is "handled": logged + alerted, no reply owed, so dedupe the retries.
  if (!text) return void (await markHandled()); // media-only — nothing to answer
  if (dmRow?.status === "dismissed") return void (await markHandled()); // Jeremy owns it
  if (!autoReplyEnabled()) return void (await markHandled()); // kill switch

  // ── JAI's answer — SAME fact sheet, SAME guards as WhatsApp ──────────────
  const contactContext = buildContactContext({
    isMember: false, // no member lookup on IG: an IGSID can't be matched to a phone
    contactName: null,
    memberNotes: null,
    history: prior,
  });

  const joinHit = detectJoinIntent(text);

  // Late arrival is answered from the rule, not the model (the model flips a
  // coin on the 15-minute boundary and got it wrong for a real customer).
  if (!joinHit) {
    const late = lateArrivalAnswer(text, undefined, prior.slice(-6).map((m) => m.message));
    if (late) return void (await deliver(sb, contact, ev, late.messageText, markHandled));
  }

  // Deterministic schedule / price answers — the two questions that cost money
  // when the model paraphrases them. New contacts get the greeting flow instead.
  if (!joinHit && !isNewContact) {
    const det = buildDeterministicAnswer(text, await getJaiFacts());
    if (det) return void (await deliver(sb, contact, ev, det.messageText, markHandled));
  }

  const answerableJoin = joinHit === "wants_to_join" && !inboundHasUnknownFigure(text);
  const promoHandoff = !!joinHit && !answerableJoin;

  const history = [...prior, { role: "user" as const, message: text }];
  const { messageText, escalation } = promoHandoff
    ? { messageText: JOIN_HANDOFF_TEXT, escalation: null as Escalation | null }
    : await generateReply(history, isNewContact, null, false, contactContext);

  let outText = messageText;
  let esc: Escalation | null = joinHit
    ? { escalation: "JOIN_INTENT", intent: joinHit, source: "guard" }
    : escalation;

  if (answerableJoin && !/getting Coach Jeremy|Coach Jeremy will (?:be in touch|reach)/i.test(outText)) {
    outText = `${outText}\n\n${JOIN_HANDOFF_SUFFIX}`;
  }

  // Money guard — the $252 incident. Any figure outside the standard rate card
  // means the reply is quoting a promo JAI does not have: bin it, hand over.
  if (hasDisallowedPrice(outText)) {
    console.warn("[jai-ig-webhook] blocked price in outbound, escalating instead");
    outText = JOIN_HANDOFF_TEXT;
    esc = { escalation: "JOIN_INTENT", intent: "price_blocked", source: "guard" };
  }

  // Dead adult-trial Calendly link — switched off 2026-07-30, the page reads
  // "not valid". Never trust the model to obey "never send X".
  if (hasDeadAdultLink(outText)) {
    console.warn("[jai-ig-webhook] blocked dead adult trial link, replaced + escalated");
    outText = PAUSED_ADULT_TRIAL_TEXT;
    if (!esc || esc.escalation === "GENERAL_ESCALATION") {
      esc = { escalation: "GENERAL_ESCALATION", intent: "dead_adult_link_blocked", source: "guard" };
    }
  }

  // TODO (needs Lane A's file): the WhatsApp route's full anti-loop guard —
  // sessionBotReplyCount + resendingLink + the forceHandoff/escalation downgrade
  // — lives INLINE in src/app/api/whatsapp/webhook/route.ts (~lines 453-511) and
  // cannot be imported without editing that file. It is NOT duplicated here.
  // What follows is only the narrowest self-contained slice of it: never send
  // the identical message twice in a row. Extract the real guard into
  // src/lib/wa/anti-loop.ts and call it from BOTH routes.
  const norm = (m: string) => m.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim().slice(0, 80);
  const prevBot = [...prior].reverse().find((m) => m.role === "assistant")?.message || "";
  if (prevBot && norm(prevBot) === norm(outText)) {
    outText = "Let me get Coach Jeremy to sort this out for you directly 🙏 He'll reach out to you shortly.";
    esc = esc ?? { escalation: "GENERAL_ESCALATION", intent: "loop_break", source: "guard" };
  }

  const sent = await deliver(sb, contact, ev, outText, markHandled);

  if (esc && sent) {
    await pingAdmins(
      `🔔 JAI — Instagram DM needs you\n` +
        `Intent: ${esc.escalation}${esc.intent ? ` / ${esc.intent}` : ""}\n` +
        `Their message: "${text.length > 200 ? text.slice(0, 197) + "..." : text}"\n` +
        `JAI replied: "${outText.length > 200 ? outText.slice(0, 197) + "..." : outText}"\n` +
        `Reply in JMT OS → Meta assistant → DMs.`,
      "jai-ig-escalation"
    );
  }
}

// Send to Instagram, then log + mark handled ONLY on a confirmed send. A failed
// send leaves handled=false so Meta's retry gets another go, and tells Jeremy
// what actually broke instead of dying in a console.error nobody reads.
async function deliver(
  sb: ReturnType<typeof createJaiClient>,
  contact: string,
  ev: IgInbound,
  outText: string,
  markHandled: () => Promise<void>
): Promise<boolean> {
  // No "*Jai*" prefix: Instagram renders asterisks literally, so the WhatsApp
  // label would arrive as "*Jai*". The IG account is @jaimuaythai already.
  const res = await postDmReply(ev.senderId, outText);
  if (!res.ok) {
    const why = describeSendError(res.code, res.error);
    console.error("[jai-ig-webhook] send failed:", why);
    await pingAdmins(
      `⚠️ Boss, JAI could not reply to an Instagram DM.\n${why}\n` +
        `Their message: "${(ev.text || "").slice(0, 160)}"\n` +
        `Please reply by hand in Instagram.`,
      "jai-ig-send-failed"
    );
    return false;
  }
  await sb.from("conversations").insert({
    contact_number: contact,
    role: "assistant",
    message: outText,
    via: "bot",
  });
  await sb
    .from("meta_dms")
    .update({ status: "replied", replied_text: outText, replied_at: new Date().toISOString() })
    .eq("conversation_id", contact);
  await markHandled();
  return true;
}

// First inbound after 30+ quiet minutes → one Telegram line, so an Instagram
// enquiry never has to be discovered by opening the app.
async function burstNote(
  sb: ReturnType<typeof createJaiClient>,
  contact: string,
  text: string | null,
  igsid: string
): Promise<string> {
  const { data: prevIn } = await sb
    .from("conversations")
    .select("created_at")
    .eq("contact_number", contact)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .range(1, 1); // row 0 is the message just inserted
  const prevTs = prevIn?.[0]?.created_at as string | undefined;
  const quietMin = prevTs ? (Date.now() - new Date(prevTs).getTime()) / 60000 : Infinity;
  if (quietMin <= 30) return "";
  const preview = text ? (text.length > 120 ? text.slice(0, 117) + "..." : text) : "[photo / video]";
  const status = !autoReplyEnabled()
    ? "JAI auto-reply is OFF for Instagram — please reply yourself."
    : "JAI is replying.";
  return (
    `Boss, Instagram DM (IGSID ${igsid}):\n"${preview}"\n${status}\n` +
    `https://jmtos.ionicx.ai/meta`
  );
}

async function pingAdmins(note: string, source: string) {
  if (!note) return;
  try {
    const pub = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: admins } = await pub.from("users").select("id").eq("role", "master_admin");
    for (const a of admins || []) await sendTelegramPlainToUser(a.id, note, source);
  } catch (e) {
    console.error("[jai-ig-webhook] admin ping failed", e);
  }
}
