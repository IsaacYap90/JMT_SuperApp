// Trial reminder — fires 1 hour before a trial class.
// Runs every 30 minutes via Vercel Cron.
// Uses a time-window approach: alerts for trials whose class starts
// between 30 and 90 minutes from now, so each trial gets exactly one
// reminder per 30-minute cron cycle.
//
// Recipients: coaches assigned to the class + all admins (Jeremy).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";
import { sendTemplateWithRetry } from "@/lib/wa/jai-send";
import { createJaiClient } from "@/lib/supabase/jai";

// SG mobile in any stored format ("+65 9123 4567" / "9123 4567") → "6591234567".
function waTo(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("65") ? digits : `65${digits}`;
}

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

function fmtTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr}${suffix}`;
}

// Tap-to-WhatsApp link with a prefilled ~1-hour reminder, so the admin can
// one-tap message the trial-booker from their own WhatsApp (same pattern as
// the 24h cron; Jeremy asked for a customer-facing 1h reminder 2026-07-02).
function waReminder1hLink(name: string, phone: string, startTime: string): string {
  const digits = phone.replace(/\D/g, "");
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  const msg =
    `Hi ${first}! Your trial at Jai Muay Thai is in about an hour — ${fmtTime(startTime)} 🥊\n` +
    `\n` +
    `Quick check: t-shirt and shorts, water bottle and a towel, and come 10 mins early if you can.\n` +
    `\n` +
    `📍 Link@AMK, 3 Ang Mo Kio Street 62, #03-17, S569139\n` +
    `https://maps.app.goo.gl/NExDxhC3KehaLiVK8\n` +
    `\n` +
    `Head to the lift lobby, take the lift to level 3 — we're directly opposite, on your right. See you soon!`;
  return `https://wa.me/65${digits}?text=${encodeURIComponent(msg)}`;
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
    .eq("status", "booked");

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

  // Filter trials whose class starts between 30 and 90 minutes from now.
  // waWindow: the [30, 60) half only — with the 30-min cron cadence a trial
  // passes through it exactly once, so the customer WhatsApp can't double-send
  // (the Telegram heads-up may repeat across the full window; that's fine).
  const upcomingTrials: { trial: (typeof trials)[0]; cls: ClsRow; waWindow: boolean }[] = [];
  for (const t of trials) {
    const cls = classMap.get(t.class_id);
    if (!cls) continue;
    const [hStr, mStr] = cls.start_time.split(":");
    const classMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    const diff = classMinutes - nowMinutes;
    if (diff >= 30 && diff < 90) {
      upcomingTrials.push({ trial: t, cls, waWindow: diff < 60 });
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
    { trial: (typeof trials)[0]; cls: ClsRow; waWindow: boolean }[]
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

  // Auto-send the approved trial_reminder_1h template to each booker, only
  // inside the once-only waWindow (approved 2026-07-02).
  const waSent = new Map<string, boolean>();
  const jai = createJaiClient();
  for (const { trial, cls, waWindow } of upcomingTrials) {
    // Emails stored in the phone field (Calendly fallback) = no phone.
    if (!waWindow || !trial.phone || trial.phone.includes("@")) continue;
    const first = (trial.name || "").trim().split(/\s+/)[0] || "there";
    const ok = await sendTemplateWithRetry(waTo(trial.phone), "trial_reminder_1h", [
      first,
      fmtTime(cls.start_time),
    ]);
    waSent.set(trial.id, ok);
    if (ok) {
      // Mirror the send into the WA INBOX thread so Jeremy can see it there.
      await jai.from("conversations").insert({
        contact_number: waTo(trial.phone),
        contact_name: trial.name,
        role: "assistant",
        message: reminder1hText(first, fmtTime(cls.start_time)),
        via: "bot",
      });
    }
  }

  let sent = 0;
  let skipped = 0;

  for (const [userId, items] of Array.from(recipientTrials)) {
    const isAdmin = adminIds.has(userId);
    // Short, casual ping (Isaac 2026-07-02) — and only in the send window;
    // the earlier 60–90 min pass stays silent so nobody gets double-pinged.
    const windowItems = items.filter(({ waWindow }) => waWindow);
    if (windowItems.length === 0) continue;

    const lines: string[] = [];
    for (const { trial, cls } of windowItems) {
      const first = (trial.name || "").trim().split(/\s+/)[0] || trial.name;
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
    if (windowItems.some(({ trial }) => waSent.get(trial.id))) {
      lines.push("Full message is in the WA INBOX tab (JMT OS).");
    }

    const message = lines.join("\n").trim();
    const ok = await sendTelegramPlainToUser(userId, message);
    if (ok) sent++;
    else skipped++;
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
