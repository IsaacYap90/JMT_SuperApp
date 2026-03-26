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
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdmin(profile.role as "admin" | "master_admin" | "coach" | "member"))
    throw new Error("Not authorized");
  return user.id;
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
  await requireAdmin();
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
      "PT Session Updated",
      `PT session with ${memberName} updated to ${dateLabel} at ${timeLabel}.`
    ).catch(() => {});
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
  await requireAdmin();
  const admin = createAdminClient();

  // Get the session to find its package
  const { data: session } = await admin
    .from("pt_sessions")
    .select("package_id, status")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  // Update session status
  const { error } = await admin
    .from("pt_sessions")
    .update({ status: newStatus })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);

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
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin.from("pt_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);
  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
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
