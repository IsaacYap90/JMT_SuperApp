// Trial reminder — fires 24 hours before a trial class.
// Runs every 30 minutes via Vercel Cron.
// Window: trials whose class starts between 23.5h and 24.5h from now.
// Recipients: coaches assigned to the class + all admins (Jeremy).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramPlainToUser } from "@/lib/telegram-alert";
import { resolveTrialRecipients } from "@/lib/trial-recipients";
import { sendTemplate } from "@/lib/wa/jai-send";
import { createJaiClient } from "@/lib/supabase/jai";

// SG mobile in any stored format ("+65 9123 4567" / "9123 4567") → "6591234567".
function waTo(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("65") ? digits : `65${digits}`;
}

// The trial_reminder_24h template body, rendered — logged to jai.conversations
// so the reminder shows up in the WA INBOX thread like any other bot message.
function reminder24hText(first: string, prettyDate: string, time: string): string {
  return (
    `Hi ${first}! Reminder — your free trial at Jai Muay Thai is tomorrow, ${prettyDate} at ${time} 🥊\n\n` +
    `What to prepare:\n` +
    `- Wear a t-shirt and shorts\n` +
    `- Bring your water bottle and a towel\n` +
    `- Arrive 10 mins earlier if possible\n\n` +
    `📍 Where to find us: Link@AMK, 3 Ang Mo Kio Street 62, #03-17, S569139\n` +
    `https://maps.app.goo.gl/NExDxhC3KehaLiVK8\n\n` +
    `Once you arrive at Link@AMK, head to the lift lobby and take the lift up to level 3. When you step out, you'll see us directly opposite, on your right.\n\n` +
    `If you can't make it, just let us know. See you tomorrow! 🙏🏽`
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

// Tap-to-WhatsApp link with a prefilled trial reminder, so the coach/admin
// can one-tap message the trial-booker from their own WhatsApp.
function waReminderLink(
  name: string,
  phone: string,
  prettyDate: string,
  startTime: string
): string {
  const digits = phone.replace(/\D/g, "");
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  const msg =
    `Hi ${first}! Reminder — your free trial at Jai Muay Thai is tomorrow, ${prettyDate} at ${fmtTime(startTime)} 🥊\n` +
    `\n` +
    `What to prepare:\n` +
    `- Wear a t-shirt and shorts\n` +
    `- Bring your water bottle and a towel\n` +
    `- Arrive 10 mins earlier if possible\n` +
    `\n` +
    `📍 Where to find us: Link@AMK, 3 Ang Mo Kio Street 62, #03-17, S569139\n` +
    `https://maps.app.goo.gl/NExDxhC3KehaLiVK8\n` +
    `\n` +
    `Once you arrive at Link@AMK, head to the lift lobby and take the lift up to level 3. When you step out, you'll see us directly opposite, on your right.\n` +
    `\n` +
    `If you can't make it, just let us know. See you tomorrow! 🙏🏽`;
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
    return NextResponse.json({ error: "Supabase env vars missing" }, { status: 500 });
  }
  const supabase = createAdminClient();

  // Tomorrow in SGT
  const now = new Date();
  const sgString = now.toLocaleString("en-US", { timeZone: "Asia/Singapore" });
  const sg = new Date(sgString);
  const tomorrow = new Date(sg);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = tomorrow.getMonth() + 1;
  const d = tomorrow.getDate();
  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const prettyDate = tomorrow.toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const nowMinutes = sg.getHours() * 60 + sg.getMinutes();

  const { data: trials } = await supabase
    .from("trial_bookings")
    .select("id, name, phone, class_id, booking_date, time_slot, status")
    .eq("booking_date", ymd)
    .eq("status", "booked")
    .is("reminder_24h_sent_at", null);

  if (!trials || trials.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no trials tomorrow" });
  }

  const classIds = Array.from(new Set(trials.map((t) => t.class_id)));
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, start_time, end_time, lead_coach_id, assistant_coach_id, class_coaches(coach_id)")
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
  for (const c of (classes || []) as ClsRow[]) classMap.set(c.id, c);

  // Window: class starts between 23.5h and 24.5h from now.
  // For a trial tomorrow at start_time, minutes-until-start = 1440 + (classMins - nowMins).
  // Fire if that is in [1410, 1470).
  const upcomingTrials: { trial: (typeof trials)[0]; cls: ClsRow }[] = [];
  for (const t of trials) {
    const cls = classMap.get(t.class_id);
    if (!cls) continue;
    const [hStr, mStr] = cls.start_time.split(":");
    const classMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    const diff = 1440 + (classMinutes - nowMinutes);
    if (diff >= 1410 && diff < 1470) {
      upcomingTrials.push({ trial: t, cls });
    }
  }

  if (upcomingTrials.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no trials in 23.5h-24.5h window" });
  }

  const recipientTrials = new Map<string, { trial: (typeof trials)[0]; cls: ClsRow }[]>();

  for (const item of upcomingTrials) {
    const coachIds = await resolveTrialRecipients(supabase, item.cls);
    for (const uid of coachIds) {
      const list = recipientTrials.get(uid) || [];
      list.push(item);
      recipientTrials.set(uid, list);
    }
  }

  // The tap-to-WhatsApp reminder link goes to admins (Jeremy) ONLY — they're the
  // ones who message the trial-booker. Coaches receive the heads-up alone, no link.
  const recipientIds = Array.from(recipientTrials.keys());
  const adminIds = new Set<string>();
  if (recipientIds.length > 0) {
    const { data: adminRows } = await supabase
      .from("users")
      .select("id")
      .in("id", recipientIds)
      .in("role", ["admin", "master_admin"]);
    for (const u of adminRows || []) adminIds.add(u.id);
  }

  // Auto-send the approved trial_reminder_24h template straight to each
  // trial-booker (business-initiated; template approved 2026-07-02). The
  // Telegram ping to coaches/admins stays as the heads-up; if a WA send
  // fails, the admin line falls back to the old one-tap wa.me link.
  const waSent = new Map<string, boolean>();
  const jai = createJaiClient();
  for (const { trial, cls } of upcomingTrials) {
    if (!trial.phone) {
      waSent.set(trial.id, false);
      continue;
    }
    const first = (trial.name || "").trim().split(/\s+/)[0] || "there";
    const ok = await sendTemplate(waTo(trial.phone), "trial_reminder_24h", [
      first,
      prettyDate,
      fmtTime(cls.start_time),
    ]);
    waSent.set(trial.id, ok);
    if (ok) {
      // Mirror the send into the WA INBOX thread so Jeremy can see it there.
      await jai.from("conversations").insert({
        contact_number: waTo(trial.phone),
        contact_name: trial.name,
        role: "assistant",
        message: reminder24hText(first, prettyDate, fmtTime(cls.start_time)),
        via: "bot",
      });
    }
  }

  let sent = 0;
  let skipped = 0;
  const deliveredTrialIds = new Set<string>();

  for (const [userId, items] of Array.from(recipientTrials)) {
    const isAdmin = adminIds.has(userId);
    // Short, casual ping (Isaac 2026-07-02: no full reminder text, just
    // "trial reminder for sarah tmr at 630pm class is sent Boss").
    const lines: string[] = [];
    for (const { trial, cls } of items) {
      const first = (trial.name || "").trim().split(/\s+/)[0] || trial.name;
      if (waSent.get(trial.id)) {
        lines.push(`✅ Boss, trial reminder sent to ${first} — ${cls.name} tomorrow ${fmtTime(cls.start_time)}`);
      } else if (isAdmin) {
        lines.push(
          `⚠️ Reminder to ${trial.name} (${trial.phone}) didn't send — tap to remind: ${waReminderLink(trial.name, trial.phone, prettyDate, cls.start_time)}`
        );
      } else {
        lines.push(`📅 Trial tomorrow ${fmtTime(cls.start_time)} ${cls.name} — ${trial.name}`);
      }
    }
    if (items.some(({ trial }) => waSent.get(trial.id))) {
      lines.push("Full message is in the WA INBOX tab (JMT OS).");
    }

    const message = lines.join("\n").trim();
    const ok = await sendTelegramPlainToUser(userId, message);
    if (ok) {
      sent++;
    } else {
      skipped++;
    }
  }

  // A trial counts as reminded if the customer got the WhatsApp, or at least
  // one Telegram heads-up landed (backstop cron picks up the rest).
  for (const { trial } of upcomingTrials) {
    if (waSent.get(trial.id) || sent > 0) deliveredTrialIds.add(trial.id);
  }

  // Mark trials whose 24h reminder reached at least one recipient, so the
  // 6h backstop cron skips them. Trials with zero successful deliveries stay
  // null and the backstop will pick them up.
  if (deliveredTrialIds.size > 0) {
    await supabase
      .from("trial_bookings")
      .update({ reminder_24h_sent_at: new Date().toISOString() })
      .in("id", Array.from(deliveredTrialIds));
  }

  return NextResponse.json({
    ok: true,
    date: ymd,
    trials: upcomingTrials.length,
    recipients: recipientTrials.size,
    sent,
    skipped,
    marked: deliveredTrialIds.size,
  });
}
