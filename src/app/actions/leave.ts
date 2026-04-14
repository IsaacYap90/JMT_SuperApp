"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "./notifications";
import { revalidatePath } from "next/cache";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Find recurring class assignments that fall within a leave date range for a coach.
// Half-day leaves (Option A: off before 6:30pm, teaching evening) only flag classes
// with start_time < 18:30. Full-day leaves flag every class on those dates.
async function findAffectedClasses(
  coachId: string,
  leaveStart: string,
  leaveEnd: string,
  isHalfDay: boolean = false
): Promise<{ name: string; date: string; time: string }[]> {
  const admin = createAdminClient();

  // Find all recurring classes the coach is assigned to (lead or assistant or via class_coaches)
  const { data: leadClasses } = await admin
    .from("classes")
    .select("id, name, day_of_week, start_time")
    .eq("lead_coach_id", coachId)
    .eq("is_active", true);
  const { data: asstClasses } = await admin
    .from("classes")
    .select("id, name, day_of_week, start_time")
    .eq("assistant_coach_id", coachId)
    .eq("is_active", true);
  const { data: ccRows } = await admin
    .from("class_coaches")
    .select("class:classes(id, name, day_of_week, start_time, is_active)")
    .eq("coach_id", coachId);

  type ClsRow = { id: string; name: string; day_of_week: string; start_time: string };
  const seen = new Set<string>();
  const all: ClsRow[] = [];
  const push = (c: ClsRow | null) => {
    if (!c || !c.id || seen.has(c.id)) return;
    seen.add(c.id);
    all.push(c);
  };
  for (const c of leadClasses || []) push(c as ClsRow);
  for (const c of asstClasses || []) push(c as ClsRow);
  for (const r of ccRows || []) {
    const raw = (r as { class: unknown }).class;
    const c = (Array.isArray(raw) ? raw[0] : raw) as (ClsRow & { is_active?: boolean }) | null;
    if (c && c.is_active !== false) push(c);
  }

  // For each class, find every date within the leave range that matches its day_of_week
  const affected: { name: string; date: string; time: string }[] = [];
  const start = new Date(leaveStart + "T00:00:00+08:00");
  const end = new Date(leaveEnd + "T00:00:00+08:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = DAY_NAMES[d.getDay()];
    for (const c of all) {
      if (c.day_of_week !== dow) continue;
      // Half-day = off before 6:30pm; skip classes that start at 18:30 or later
      if (isHalfDay && c.start_time >= "18:30") continue;
      const dateLabel = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore" });
      affected.push({ name: c.name, date: dateLabel, time: c.start_time.slice(0, 5) });
    }
  }
  return affected;
}

export async function submitLeave(payload: {
  leave_date: string;
  leave_end_date: string;
  leave_type: string;
  is_half_day: boolean;
  reason: string;
  target_coach_id?: string;
}) {
  const userId = await getAuthUser();
  const admin = createAdminClient();

  // Admins may submit leave on behalf of another coach (e.g. Jeremy logging an
  // MC on Isaac's profile). Non-admins always get coach_id = self.
  let coachId = userId;
  if (payload.target_coach_id && payload.target_coach_id !== userId) {
    const { data: callerProfile } = await admin
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();
    const callerRole = callerProfile?.role;
    if (callerRole !== "admin" && callerRole !== "master_admin") {
      throw new Error("Not authorized to submit leave for another coach");
    }
    coachId = payload.target_coach_id;
  }

  // Get coach name (for the target coach, so notifications read correctly)
  const { data: coach } = await admin
    .from("users")
    .select("full_name")
    .eq("id", coachId)
    .single();
  const coachName = coach?.full_name || "Coach";

  const { data: inserted, error } = await admin
    .from("leaves")
    .insert({
      coach_id: coachId,
      leave_date: payload.leave_date,
      leave_end_date: payload.leave_end_date || payload.leave_date,
      leave_type: payload.leave_type,
      is_half_day: payload.is_half_day,
      reason: payload.reason,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Find affected classes within the leave range (for the target coach)
  const affected = await findAffectedClasses(
    coachId,
    payload.leave_date,
    payload.leave_end_date || payload.leave_date,
    payload.is_half_day
  );

  // Notify all admins
  const { data: admins } = await admin
    .from("users")
    .select("id")
    .in("role", ["admin", "master_admin"])
    .is("merged_into_id", null);

  if (admins) {
    const dateRange = payload.leave_date === (payload.leave_end_date || payload.leave_date)
      ? payload.leave_date
      : `${payload.leave_date} to ${payload.leave_end_date}`;
    const halfDayLabel = payload.is_half_day ? " (half day — off before 6:30pm)" : "";
    const conflictLine = affected.length
      ? `\n\n⚠️ Affected classes needing substitute:\n${affected.map((a) => `• ${a.name} — ${a.date} ${a.time}`).join("\n")}`
      : "";
    const message = `${coachName} requested ${payload.leave_type} leave${halfDayLabel} for ${dateRange}.${conflictLine}`;

    for (const a of admins) {
      if (a.id === userId) continue;
      createNotification(
        a.id,
        "system",
        affected.length ? "⚠️ Leave Request — Class Conflict" : "Leave Request",
        message
      ).catch((err) => console.error("Failed to notify admin of leave:", err));
    }
  }

  revalidatePath("/leave");
  return { id: inserted?.id, conflicts: affected.length };
}

export async function reviewLeave(leaveId: string, action: "approved" | "rejected") {
  const userId = await getAuthUser();
  const admin = createAdminClient();

  const { data: leave } = await admin
    .from("leaves")
    .select("id, coach_id, leave_date, leave_end_date, leave_type, is_half_day, status, coach:users!leaves_coach_id_fkey(full_name)")
    .eq("id", leaveId)
    .single();

  if (!leave) throw new Error("Leave not found");

  // Idempotency guard — if the leave is already in the target state, skip the
  // update + notification pipeline entirely. Prevents duplicate Telegram alerts
  // when the action is re-triggered (router refresh race, accidental re-tap,
  // pending-list snapshot drift, etc.).
  if (leave.status === action) {
    revalidatePath("/leave");
    return;
  }

  const { error } = await admin
    .from("leaves")
    .update({
      status: action,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", leaveId)
    .eq("status", "pending"); // only transition from pending → approved/rejected

  if (error) throw new Error(error.message);

  // Notify the coach of the decision
  const dateRange = leave.leave_date === leave.leave_end_date
    ? leave.leave_date
    : `${leave.leave_date} to ${leave.leave_end_date}`;
  const halfDayLabel = leave.is_half_day ? " (half day — off before 6:30pm)" : "";

  if (action === "approved") {
    // Find conflicts and re-notify admins so Jeremy is reminded right at approval time
    const affected = await findAffectedClasses(leave.coach_id, leave.leave_date, leave.leave_end_date, leave.is_half_day);
    const coachName = ((leave.coach as unknown as { full_name: string } | null))?.full_name || "Coach";

    if (affected.length > 0) {
      const { data: admins } = await admin
        .from("users")
        .select("id")
        .in("role", ["admin", "master_admin"]);

      if (admins) {
        const conflictLine = affected.map((a) => `• ${a.name} — ${a.date} ${a.time}`).join("\n");
        for (const a of admins) {
          createNotification(
            a.id,
            "system",
            "⚠️ Approved Leave — Substitute Needed",
            `${coachName}'s ${leave.leave_type} leave${halfDayLabel} for ${dateRange} is approved. These classes still have ${coachName} assigned and need a substitute:\n${conflictLine}`
          ).catch((err) => console.error("Failed to notify admin of conflict:", err));
        }
      }
    }

    createNotification(
      leave.coach_id,
      "system",
      "Leave Approved ✅",
      `Your ${leave.leave_type} leave${halfDayLabel} for ${dateRange} has been approved.`
    ).catch((err) => console.error("Failed to notify coach of leave approval:", err));
  } else {
    createNotification(
      leave.coach_id,
      "system",
      "Leave Rejected ❌",
      `Your ${leave.leave_type} leave${halfDayLabel} for ${dateRange} was rejected.`
    ).catch((err) => console.error("Failed to notify coach of leave rejection:", err));
  }

  revalidatePath("/leave");
}

async function getAuthUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function cancelLeave(leaveId: string) {
  const userId = await getAuthUser();
  const admin = createAdminClient();

  // Verify the leave belongs to this user, OR the caller is an admin (admins
  // can cancel/delete any leave — e.g. Jeremy removing an MC from Isaac's
  // profile after correction).
  const { data: leave } = await admin
    .from("leaves")
    .select("coach_id, leave_date")
    .eq("id", leaveId)
    .single();

  if (!leave) throw new Error("Leave not found");

  if (leave.coach_id !== userId) {
    const { data: callerProfile } = await admin
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();
    const callerRole = callerProfile?.role;
    if (callerRole !== "admin" && callerRole !== "master_admin") {
      throw new Error("Not authorized");
    }
  } else {
    // Owner cancelling their own leave — past leaves stay locked.
    const today = new Date().toISOString().split("T")[0];
    if (leave.leave_date < today) throw new Error("Cannot cancel past leaves");
  }

  const { error } = await admin.from("leaves").delete().eq("id", leaveId);
  if (error) throw new Error(error.message);

  revalidatePath("/leave");
}

// Admin-only: grant off-in-lieu credit days to a coach. Used by Jeremy when a
// coach works a Sunday/holiday or stays back for an event. Recorded in
// in_lieu_credits so balance = credits_earned - in_lieu_used.
export async function addInLieuCredit(payload: {
  coach_id: string;
  days: number;
  reason: string;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "admin" && profile.role !== "master_admin")) {
    throw new Error("Not authorized");
  }

  if (!payload.coach_id) throw new Error("Coach required");
  if (!payload.reason.trim()) throw new Error("Reason required");
  if (!(payload.days > 0)) throw new Error("Days must be positive");

  const admin = createAdminClient();
  const { error } = await admin.from("in_lieu_credits").insert({
    coach_id: payload.coach_id,
    days: payload.days,
    reason: payload.reason.trim(),
    granted_by: user.id,
  });
  if (error) throw new Error(error.message);

  // Notify the coach so they see it in-app + on Telegram if mapped.
  await createNotification(
    payload.coach_id,
    "system",
    "Off in lieu credited",
    `${payload.days} day(s) added — ${payload.reason.trim()}`
  );

  revalidatePath("/leave");
}
