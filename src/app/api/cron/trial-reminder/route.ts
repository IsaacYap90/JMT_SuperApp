// Trial reminder — fires ~1 hour before a trial class.
// Runs every 30 minutes via Vercel Cron.
// Window: class starts 30–90 minutes from now. Idempotency: the
// reminder_1h_sent_at column (per the repo cron rule: interval < window-size
// requires a _sent_at filter, or duplicates fire) — a trial is processed
// exactly once, jitter- and retry-proof.
//
// Recipients: customer gets the trial_reminder_1h WhatsApp template;
// coaches assigned to the class + all admins (Jeremy) get a short Telegram.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";
import { firstNameFrom } from "@/lib/wa/jai-reply";
import { sendTemplateWithRetry, waTo } from "@/lib/wa/jai-send";
import { createJaiClient } from "@/lib/supabase/jai";

// The trial_reminder_1h template body, rendered — logged to jai.conversations
// so the reminder shows up in the WA INBOX thread like any other bot message.
function reminder1hText(first: string, time: string): string {
  return (
    `Hi ${first}! Your trial at Jai Muay Thai is in about an hour — ${time} 🥊\n\n` +
    `Quick check: t-shirt and shorts, water bottle and a towel, and come 10 mins early if you can.\n\n` +
    `📍 Link@AMK, 3 Ang Mo Kio Street 62, #03-17, S569139\n` +
    `https://maps.app.goo.gl/NExDxhC3KehaLiVK8\n\n` +
    `Head to the lift lobby, take the lift to level 3 — we're directly opposite, on your right. See you soon!`
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function fmtTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${suffix}`;
}

// Tap-to-WhatsApp fallback link — same text the auto-send delivers, so the
// manual path and the WA INBOX mirror can never drift apart.
function waReminder1hLink(name: string, phone: string, startTime: string): string {
  const first = firstNameFrom(name) || "there";
  return `https://wa.me/${waTo(phone)}?text=${encodeURIComponent(reminder1hText(first, fmtTime(startTime)))}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Supabase env vars missing" },
      { status: 500 }
    );
  }
  const supabase = createAdminClient();

  // Today in SGT
  const now = new Date();
  const sgString = now.toLocaleString("en-US", { timeZone: "Asia/Singapore" });
  const sg = new Date(sgString);
  const y = sg.getFullYear();
  const m = sg.getMonth() + 1;
  const d = sg.getDate();
  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Current SGT time in minutes since midnight
  const nowMinutes = sg.getHours() * 60 + sg.getMinutes();

  // Today's booked trials
  const { data: trials } = await supabase
    .from("trial_bookings")
    .select("id, name, phone, class_id, booking_date, time_slot, status, calendly_details")
    .eq("booking_date", ymd)
    .eq("status", "booked")
    .is("reminder_1h_sent_at", null);

  if (!trials || trials.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no trials today" });
  }

  // Get all classes referenced by today's trials
  const classIds = Array.from(new Set(trials.map((t) => t.class_id)));
  const { data: classes } = await supabase
    .from("classes")
    .select(
      "id, name, start_time, end_time, lead_coach_id, assistant_coach_id, class_coaches(coach_id)"
    )
    .in("id", classIds);

  type ClsRow = {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    lead_coach_id: string | null;
    assistant_coach_id: string | null;
    class_coaches: { coach_id: string }[] | null;
  };

  const classMap = new Map<string, ClsRow>();
  for (const c of (classes || []) as ClsRow[]) {
    classMap.set(c.id, c);
  }

  // Trials whose class starts 30–90 minutes from now. The
  // reminder_1h_sent_at filter above makes this once-only regardless of
  // cron jitter, double-fires, or skipped runs.
  const upcomingTrials: { trial: (typeof trials)[0]; cls: ClsRow }[] = [];
  for (const t of trials) {
    const cls = classMap.get(t.class_id);
    if (!cls) continue;
    const [hStr, mStr] = cls.start_time.split(":");
    const classMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    const diff = classMinutes - nowMinutes;
    if (diff >= 30 && diff < 90) {
      upcomingTrials.push({ trial: t, cls });
    }
  }

  if (upcomingTrials.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      reason: "no trials in the next 30-90 min window",
    });
  }

  // All admins
  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .in("role", ["admin", "master_admin"])
    .eq("is_active", true)
    .is("merged_into_id", null);
  const adminIds = new Set<string>((admins || []).map((u) => u.id));

  // Group trials by recipient
  const recipientTrials = new Map<
    string,
    { trial: (typeof trials)[0]; cls: ClsRow }[]
  >();

  for (const item of upcomingTrials) {
    const coachIds = new Set<string>();
    if (item.cls.lead_coach_id) coachIds.add(item.cls.lead_coach_id);
    if (item.cls.assistant_coach_id) coachIds.add(item.cls.assistant_coach_id);
    for (const cc of item.cls.class_coaches || []) {
      if (cc.coach_id) coachIds.add(cc.coach_id);
    }
    // Add admins
    Array.from(adminIds).forEach((id) => coachIds.add(id));

    for (const uid of Array.from(coachIds)) {
      const list = recipientTrials.get(uid) || [];
      list.push(item);
      recipientTrials.set(uid, list);
    }
  }

  // Auto-send the approved trial_reminder_1h template to each booker
  // (approved 2026-07-02).
  const waSent = new Map<string, boolean>();
  const jai = createJaiClient();
  const waEnvOk = !!(process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN);
  for (const { trial, cls } of upcomingTrials) {
    // Emails stored in the phone field (Calendly fallback) = no phone.
    if (!waEnvOk || !trial.phone || trial.phone.includes("@")) continue;
    const first = firstNameFrom(trial.name) || "there";
    const ok = await sendTemplateWithRetry(waTo(trial.phone), "trial_reminder_1h", [
      first,
      fmtTime(cls.start_time),
    ]);
    waSent.set(trial.id, ok);
    if (ok) {
      // Mirror the send into the WA INBOX thread so Jeremy can see it there.
      // Never let a mirror failure abort the remaining sends or the marking.
      try {
        await jai.from("conversations").insert({
          contact_number: waTo(trial.phone),
          contact_name: trial.name,
          role: "assistant",
          message: reminder1hText(first, fmtTime(cls.start_time)),
          via: "bot",
        });
      } catch (e) {
        console.error("[trial-reminder-1h] WA INBOX mirror failed", e);
      }
    }
  }

  let sent = 0;
  let skipped = 0;

  const deliveredTrialIds = new Set<string>();
  for (const [userId, items] of Array.from(recipientTrials)) {
    const isAdmin = adminIds.has(userId);
    // Short, casual ping (Isaac 2026-07-02).
    const lines: string[] = [];
    for (const { trial, cls } of items) {
      const first = firstNameFrom(trial.name) || trial.name;
      const email = (trial.calendly_details as { email?: string } | null)?.email;
      if (waSent.get(trial.id)) {
        lines.push(`✅ Boss, 1-hour reminder sent to ${first} — ${cls.name} at ${fmtTime(cls.start_time)}`);
      } else if ((!trial.phone || trial.phone.includes("@")) && isAdmin) {
        lines.push(
          `📧 Boss, ${trial.name} has no phone number (${email || (trial.phone?.includes("@") ? trial.phone : "no email either")}) — trial at ${fmtTime(cls.start_time)}. Please remind them manually.`
        );
      } else if (isAdmin && trial.phone) {
        // Auto-send failed — fall back to the one-tap manual reminder.
        lines.push(`⚠️ 1-hour reminder to ${trial.name} (${trial.phone}) didn't send — tap to remind: ${waReminder1hLink(trial.name, trial.phone, cls.start_time)}`);
      } else {
        lines.push(`⏰ Trial in ~1h: ${fmtTime(cls.start_time)} ${cls.name} — ${trial.name}`);
      }
    }
    if (items.some(({ trial }) => waSent.get(trial.id))) {
      lines.push("Full message is in the WA INBOX tab (JMT OS).");
    }

    const message = lines.join("\n").trim();
    const ok = await sendTelegramPlainToUser(userId, message);
    if (ok) {
      sent++;
      // Per-recipient marking: a trial is covered when a Telegram that
      // contained it was delivered (admins get the manual-remind lines).
      for (const { trial } of items) deliveredTrialIds.add(trial.id);
    } else {
      skipped++;
    }
  }

  // Customer WhatsApp also counts as delivered.
  for (const { trial } of upcomingTrials) {
    if (waSent.get(trial.id)) deliveredTrialIds.add(trial.id);
  }

  // Stamp processed trials so no future run re-sends (cron idempotency rule).
  if (deliveredTrialIds.size > 0) {
    await supabase
      .from("trial_bookings")
      .update({ reminder_1h_sent_at: new Date().toISOString() })
      .in("id", Array.from(deliveredTrialIds));
  }

  return NextResponse.json({
    ok: true,
    date: ymd,
    trials: upcomingTrials.length,
    recipients: recipientTrials.size,
    sent,
    skipped,
  });
}
