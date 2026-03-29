"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/types/database";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createNotification } from "./notifications";

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdmin(profile.role as "admin" | "master_admin" | "coach" | "member"))
    throw new Error("Not authorized");
  return { id: user.id, name: profile.full_name || "Admin" };
}

// Create a PT client profile (name + phone, role=member)
export async function createPtClient(fullName: string, phone: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const id = randomUUID();
  const { data, error } = await admin.from("users").insert({
    id,
    full_name: fullName,
    phone: phone || null,
    role: "member",
    is_active: true,
    email: `pt_${id.slice(0, 8)}@jmt.local`,
  }).select().single();

  if (error) throw new Error(error.message);
  revalidatePath("/pt");
  return data;
}

// Create PT package
export async function createPtPackage(payload: {
  user_id: string;
  preferred_coach_id: string;
  total_sessions: number;
  sessions_used: number;
  expiry_date: string | null;
}) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin.from("pt_packages").insert({
    ...payload,
    status: payload.sessions_used >= payload.total_sessions ? "completed" : "active",
  });

  if (error) throw new Error(error.message);
  revalidatePath("/pt");
}

// Update PT package
export async function updatePtPackage(
  id: string,
  payload: {
    user_id: string;
    preferred_coach_id: string;
    total_sessions: number;
    sessions_used: number;
    expiry_date: string | null;
  }
) {
  await requireAdmin();
  const admin = createAdminClient();

  const status =
    payload.sessions_used >= payload.total_sessions
      ? "completed"
      : payload.expiry_date && new Date(payload.expiry_date) < new Date()
      ? "expired"
      : "active";

  const { error } = await admin
    .from("pt_packages")
    .update({ ...payload, status })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/pt");
}

// Create PT session (and auto-link to package + increment sessions_used)
export async function createPtSession(payload: {
  coach_id: string;
  member_id: string;
  scheduled_at: string;
  duration_minutes: number;
}) {
  await requireAdmin();
  const admin = createAdminClient();

  // Find active package for this member+coach
  const { data: pkg } = await admin
    .from("pt_packages")
    .select("id, sessions_used, total_sessions")
    .eq("user_id", payload.member_id)
    .eq("preferred_coach_id", payload.coach_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: session, error } = await admin
    .from("pt_sessions")
    .insert({
      package_id: pkg?.id || null,
      ...payload,
      status: "scheduled",
    })
    .select(
      "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*)"
    )
    .single();

  if (error) throw new Error(error.message);

  // Notify the coach
  if (session) {
    const memberName = session.member?.full_name || "Client";
    const dt = new Date(payload.scheduled_at);
    const dateLabel = dt.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Asia/Singapore",
    });
    const timeLabel = dt.toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Singapore",
    });
    createNotification(
      payload.coach_id,
      "pt_scheduled",
      "PT Session Scheduled",
      `PT session with ${memberName} on ${dateLabel} at ${timeLabel}.`
    ).catch(() => {});
  }

  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
  return session;
}

// Update PT session (date, time, coach, duration)
export async function updatePtSession(
  sessionId: string,
  payload: {
    coach_id: string;
    scheduled_at: string;
    duration_minutes: number;
  }
) {
  const adminUser = await requireAdmin();
  const admin = createAdminClient();

  const { data: session, error } = await admin
    .from("pt_sessions")
    .update(payload)
    .eq("id", sessionId)
    .select(
      "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*)"
    )
    .single();

  if (error) throw new Error(error.message);

  // Notify the coach about the update
  if (session) {
    const dt = new Date(payload.scheduled_at);
    const dayLabel = dt.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Asia/Singapore",
    });
    const timeLabel = dt.toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Singapore",
    });
    createNotification(
      payload.coach_id,
      "pt_scheduled",
      "PT Session Updated",
      `${adminUser.name} updated your PT session on ${dayLabel} at ${timeLabel}.`
    ).catch((err) => console.error("Failed to create notification:", err));
  }

  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
  return session;
}

// Update session status (completed, cancelled, no_show)
export async function updateSessionStatus(
  sessionId: string,
  newStatus: "completed" | "cancelled" | "no_show"
) {
  const adminUser = await requireAdmin();
  const admin = createAdminClient();

  // Get the session to find its package and coach info
  const { data: session } = await admin
    .from("pt_sessions")
    .select("package_id, status, coach_id, scheduled_at, duration_minutes, member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  // Update session status
  const { error } = await admin
    .from("pt_sessions")
    .update({ status: newStatus })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);

  // Notify coach about cancellation
  if (newStatus === "cancelled" && session.coach_id) {
    const memberName = ((session.member as unknown as { full_name: string } | null))?.full_name || "Client";
    const dt = new Date(session.scheduled_at);
    const dateLabel = dt.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Asia/Singapore",
    });
    const timeLabel = dt.toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Singapore",
    });
    createNotification(
      session.coach_id,
      "class_cancelled",
      "PT Session Cancelled",
      `${adminUser.name} cancelled your PT session with ${memberName} on ${dateLabel} at ${timeLabel}.`
    ).catch(() => {});
  }

  // If marking as completed, increment sessions_used on the package
  if (newStatus === "completed" && session.package_id && session.status !== "completed") {
    const { data: pkg } = await admin
      .from("pt_packages")
      .select("sessions_used, total_sessions")
      .eq("id", session.package_id)
      .single();

    if (pkg) {
      const newUsed = pkg.sessions_used + 1;
      const pkgStatus = newUsed >= pkg.total_sessions ? "completed" : "active";
      await admin
        .from("pt_packages")
        .update({ sessions_used: newUsed, status: pkgStatus })
        .eq("id", session.package_id);
    }
  }

  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
}

// Delete PT session
export async function deletePtSession(sessionId: string) {
  const adminUser = await requireAdmin();
  const admin = createAdminClient();

  // Get session details before deleting for notification
  const { data: session } = await admin
    .from("pt_sessions")
    .select("coach_id, scheduled_at, member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("id", sessionId)
    .single();

  const { error } = await admin.from("pt_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);

  // Notify coach about deletion
  if (session?.coach_id) {
    const memberName = ((session.member as unknown as { full_name: string } | null))?.full_name || "Client";
    const dt = new Date(session.scheduled_at);
    const dateLabel = dt.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Asia/Singapore",
    });
    const timeLabel = dt.toLocaleTimeString("en-SG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Singapore",
    });
    createNotification(
      session.coach_id,
      "class_cancelled",
      "PT Session Removed",
      `${adminUser.name} removed your PT session with ${memberName} on ${dateLabel} at ${timeLabel}.`
    ).catch(() => {});
  }

  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
}

// Check if next week has PT sessions already
export async function getNextWeekPtCount(): Promise<number> {
  await requireAdmin();
  const admin = createAdminClient();

  // Calculate next week Mon-Sun in SGT
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const daysUntilNextMon = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMon = new Date(now);
  nextMon.setDate(now.getDate() + daysUntilNextMon);
  nextMon.setHours(0, 0, 0, 0);
  const nextSun = new Date(nextMon);
  nextSun.setDate(nextMon.getDate() + 6);
  nextSun.setHours(23, 59, 59, 999);

  const startISO = new Date(nextMon.getTime() - 8 * 60 * 60 * 1000).toISOString(); // SGT to UTC
  const endISO = new Date(nextSun.getTime() - 8 * 60 * 60 * 1000).toISOString();

  const { count } = await admin
    .from("pt_sessions")
    .select("*", { count: "exact", head: true })
    .gte("scheduled_at", startISO)
    .lte("scheduled_at", endISO);

  return count || 0;
}

// Copy PT sessions from current week to next week (+7 days)
export async function copyPtSessionsToNextWeek(): Promise<{ copied: number }> {
  await requireAdmin();
  const admin = createAdminClient();

  // Calculate current week Mon-Sun in SGT
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const daysSinceMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMon = new Date(now);
  thisMon.setDate(now.getDate() - daysSinceMon);
  thisMon.setHours(0, 0, 0, 0);
  const thisSun = new Date(thisMon);
  thisSun.setDate(thisMon.getDate() + 6);
  thisSun.setHours(23, 59, 59, 999);

  const startISO = new Date(thisMon.getTime() - 8 * 60 * 60 * 1000).toISOString();
  const endISO = new Date(thisSun.getTime() - 8 * 60 * 60 * 1000).toISOString();

  // Fetch this week's sessions
  const { data: sessions, error } = await admin
    .from("pt_sessions")
    .select("coach_id, member_id, scheduled_at, duration_minutes, package_id")
    .gte("scheduled_at", startISO)
    .lte("scheduled_at", endISO)
    .neq("status", "cancelled");

  if (error) throw new Error(error.message);
  if (!sessions || sessions.length === 0) return { copied: 0 };

  // Create new sessions shifted by +7 days
  const newSessions = sessions.map((s) => {
    const dt = new Date(s.scheduled_at);
    dt.setDate(dt.getDate() + 7);
    return {
      coach_id: s.coach_id,
      member_id: s.member_id,
      scheduled_at: dt.toISOString(),
      duration_minutes: s.duration_minutes,
      package_id: s.package_id,
      status: "scheduled",
    };
  });

  const { error: insertErr } = await admin.from("pt_sessions").insert(newSessions);
  if (insertErr) throw new Error(insertErr.message);

  revalidatePath("/pt");
  revalidatePath("/schedule");
  revalidatePath("/");
  return { copied: newSessions.length };
}

// Auto-expire packages (0 sessions left or past expiry)
export async function autoExpirePackages() {
  await requireAdmin();
  const admin = createAdminClient();

  const today = new Date().toISOString().split("T")[0];

  // Expire packages past expiry date
  await admin
    .from("pt_packages")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expiry_date", today)
    .not("expiry_date", "is", null);

  // Complete packages with no sessions left
  const { data: fullPackages } = await admin
    .from("pt_packages")
    .select("id, sessions_used, total_sessions")
    .eq("status", "active");

  if (fullPackages) {
    const toComplete = fullPackages.filter((p) => p.sessions_used >= p.total_sessions);
    for (const p of toComplete) {
      await admin.from("pt_packages").update({ status: "completed" }).eq("id", p.id);
    }
  }

  // Auto-mark past "scheduled" sessions as completed
  await admin
    .from("pt_sessions")
    .update({ status: "completed" })
    .eq("status", "scheduled")
    .lt("scheduled_at", today);

  // Clean up orphaned sessions (no member assigned)
  await admin
    .from("pt_sessions")
    .delete()
    .is("member_id", null);

  revalidatePath("/pt");
}
