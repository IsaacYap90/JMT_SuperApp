"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/types/database";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createNotification } from "./notifications";

function formatSgtDate(date: Date): string {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Asia/Singapore" });
  const day = date.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Asia/Singapore" });
  const month = date.toLocaleDateString("en-GB", { month: "long", timeZone: "Asia/Singapore" });
  return `${weekday}, ${day} ${month}`;
}

function formatSgtTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
}

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
export async function createPtClient(
  fullName: string,
  phone: string,
  opts?: { pay_per_class?: boolean; default_price_per_class?: number | null }
) {
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
    pt_pay_per_class: opts?.pay_per_class ?? false,
    pt_default_price_per_class: opts?.default_price_per_class ?? null,
  }).select().single();

  if (error) throw new Error(error.message);
  revalidatePath("/pt");
  return data;
}

// Update PT client
export async function updatePtClient(
  id: string,
  fullName: string,
  phone: string,
  opts?: { pay_per_class?: boolean; default_price_per_class?: number | null }
) {
  await requireAdmin();
  const admin = createAdminClient();

  const update: Record<string, unknown> = {
    full_name: fullName,
    phone: phone || null,
  };
  if (opts) {
    update.pt_pay_per_class = opts.pay_per_class ?? false;
    update.pt_default_price_per_class = opts.default_price_per_class ?? null;
  }

  const { error } = await admin.from("users").update(update).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/pt");
}

// Delete a PT client profile — used to clean up duplicates Jeremy accidentally
// creates. Safety: only allowed if the client has NO packages and NO sessions;
// otherwise we'd silently orphan data. Error message tells the admin exactly
// what blocks the delete so they know how to resolve it.
export type DeletePtClientResult = { ok: true } | { ok: false; error: string };

export async function deletePtClient(id: string): Promise<DeletePtClientResult> {
  await requireAdmin();
  const admin = createAdminClient();

  // Guard 1: must be a member, not a coach/admin.
  const { data: target } = await admin
    .from("users")
    .select("id, role, full_name")
    .eq("id", id)
    .single();

  if (!target) return { ok: false, error: "Client not found" };
  if (target.role !== "member") {
    return { ok: false, error: "This profile is a coach/admin, not a PT client — cannot delete from the PT tab." };
  }

  // Guard 2: no pt_packages attached.
  const { count: pkgCount } = await admin
    .from("pt_packages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", id);

  if ((pkgCount ?? 0) > 0) {
    return { ok: false, error: `${target.full_name} has ${pkgCount} PT package(s). Delete the package(s) first, then retry.` };
  }

  // Guard 3: no pt_sessions attached (member_id is NO ACTION on FK).
  const { count: sessCount } = await admin
    .from("pt_sessions")
    .select("*", { count: "exact", head: true })
    .eq("member_id", id);

  if ((sessCount ?? 0) > 0) {
    return { ok: false, error: `${target.full_name} has ${sessCount} PT session(s) in history. Delete the session(s) first, then retry.` };
  }

  // Safe to delete.
  const { error } = await admin.from("users").delete().eq("id", id);
  if (error) {
    // Return the full Postgres error as data — throwing would let Next's
    // production build redact the message into "Server Components render".
    const code = (error as { code?: string }).code || "";
    const details = (error as { details?: string }).details || "";
    const hint = (error as { hint?: string }).hint || "";
    console.error(`[deletePtClient] failed for ${id}:`, error);
    return {
      ok: false,
      error: `Delete failed for ${target.full_name} [${code}]: ${error.message}${details ? ` — ${details}` : ""}${hint ? ` (${hint})` : ""}`,
    };
  }
  revalidatePath("/pt");
  return { ok: true };
}

// Create PT package
export async function createPtPackage(payload: {
  user_id: string;
  preferred_coach_id: string;
  total_sessions: number;
  sessions_used: number;
  expiry_date: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
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
    guardian_name?: string | null;
    guardian_phone?: string | null;
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

// Delete PT package. Blocks if the package has PT sessions still on it — the
// admin must delete or reassign those sessions first. Any signed pt_contracts
// referencing this package cascade via the FK (on delete cascade).
export type DeletePtPackageResult = { ok: true } | { ok: false; error: string };

export async function deletePtPackage(id: string): Promise<DeletePtPackageResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const { count: sessCount } = await admin
    .from("pt_sessions")
    .select("*", { count: "exact", head: true })
    .eq("package_id", id);

  if ((sessCount ?? 0) > 0) {
    return {
      ok: false,
      error: `Package has ${sessCount} PT session(s). Delete the session(s) first, then retry.`,
    };
  }

  const { error } = await admin.from("pt_packages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pt");
  return { ok: true };
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

  // Find active package for this member+coach. Pay-per-class clients won't
  // have one — fall back to a null package_id (pt_sessions.package_id is
  // nullable for this case).
  const { data: pkg } = await admin
    .from("pt_packages")
    .select("id, sessions_used, total_sessions")
    .eq("user_id", payload.member_id)
    .eq("preferred_coach_id", payload.coach_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  // Notify the coach. PT is personal — only the assigned coach is notified,
  // no admin blast.
  if (session) {
    const memberName = session.member?.full_name || "Client";
    const dt = new Date(payload.scheduled_at);
    createNotification(
      payload.coach_id,
      "pt_created",
      "PT Session Scheduled",
      `PT session with ${memberName} on ${formatSgtDate(dt)} at ${formatSgtTime(dt)}.`
    ).catch((err) => console.error("Failed to create PT notification:", err));
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

  // Get old session to check if coach changed
  const { data: oldSession } = await admin
    .from("pt_sessions")
    .select("coach_id, member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("id", sessionId)
    .single();

  const { data: session, error } = await admin
    .from("pt_sessions")
    .update(payload)
    .eq("id", sessionId)
    .select(
      "*, coach:users!pt_sessions_coach_id_fkey(*), member:users!pt_sessions_member_id_fkey(*)"
    )
    .single();

  if (error) throw new Error(error.message);

  if (session) {
    const memberName = session.member?.full_name || "Client";
    const dt = new Date(payload.scheduled_at);
    const dateTime = `${formatSgtDate(dt)} at ${formatSgtTime(dt)}`;

    // Notify the new/current coach about the update
    createNotification(
      payload.coach_id,
      "pt_created",
      "PT Session Updated",
      `${adminUser.name} updated your PT session with ${memberName} on ${dateTime}.`
    ).catch((err) => console.error("Failed to create notification:", err));

    // If coach was changed, notify the old coach they've been removed
    if (oldSession && oldSession.coach_id && oldSession.coach_id !== payload.coach_id) {
      const oldMemberName = ((oldSession.member as unknown as { full_name: string } | null))?.full_name || "Client";
      createNotification(
        oldSession.coach_id,
        "class_cancelled",
        "PT Session Reassigned",
        `${adminUser.name} reassigned your PT session with ${oldMemberName} on ${dateTime} to another coach.`
      ).catch((err) => console.error("Failed to create notification:", err));
    }
  }

  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
  return session;
}

export type SessionSignaturePayload = {
  signed_on_paper: boolean;
  // Data URL of the client's drawn signature. Empty when signed_on_paper=true.
  client_signature: string;
  // For pay-per-class sessions: amount received for this class.
  paid_amount?: number | null;
};

// Update session status (completed, cancelled, no_show)
export async function updateSessionStatus(
  sessionId: string,
  newStatus: "completed" | "cancelled" | "no_show",
  signature?: SessionSignaturePayload
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

  // Update session status (plus signature fields when completing)
  const updatePayload: Record<string, unknown> = { status: newStatus };
  if (newStatus === "completed" && signature) {
    updatePayload.signed_on_paper = signature.signed_on_paper;
    updatePayload.client_signature = signature.signed_on_paper ? null : signature.client_signature || null;
    updatePayload.signed_at = new Date().toISOString();
    updatePayload.signed_by = adminUser.id;
    if (signature.paid_amount != null) updatePayload.paid_amount = signature.paid_amount;
  }

  const { error } = await admin
    .from("pt_sessions")
    .update(updatePayload)
    .eq("id", sessionId);

  if (error) throw new Error(error.message);

  // Notify coach about status change
  if (session.coach_id) {
    const memberName = ((session.member as unknown as { full_name: string } | null))?.full_name || "Client";
    const dt = new Date(session.scheduled_at);
    const dateTime = `${formatSgtDate(dt)} at ${formatSgtTime(dt)}`;

    if (newStatus === "cancelled") {
      createNotification(
        session.coach_id,
        "class_cancelled",
        "PT Session Cancelled",
        `${adminUser.name} cancelled your PT session with ${memberName} on ${dateTime}.`
      ).catch((err) => console.error("Failed to create PT notification:", err));
    } else if (newStatus === "completed") {
      createNotification(
        session.coach_id,
        "pt_created",
        "PT Session Completed",
        `Your PT session with ${memberName} on ${dateTime} has been marked as completed.`
      ).catch((err) => console.error("Failed to create PT notification:", err));
    } else if (newStatus === "no_show") {
      createNotification(
        session.coach_id,
        "pt_created",
        "PT Session No-Show",
        `Your PT session with ${memberName} on ${dateTime} was marked as no-show.`
      ).catch((err) => console.error("Failed to create PT notification:", err));
    }
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
    createNotification(
      session.coach_id,
      "class_cancelled",
      "PT Session Removed",
      `${adminUser.name} removed your PT session with ${memberName} on ${formatSgtDate(dt)} at ${formatSgtTime(dt)}.`
    ).catch((err) => console.error("Failed to create PT notification:", err));
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

  // Notify each coach about their copied sessions
  const coachSessionMap = new Map<string, { memberIds: string[]; dates: Date[] }>();
  for (const ns of newSessions) {
    const entry = coachSessionMap.get(ns.coach_id) || { memberIds: [], dates: [] };
    if (!entry.memberIds.includes(ns.member_id)) entry.memberIds.push(ns.member_id);
    entry.dates.push(new Date(ns.scheduled_at));
    coachSessionMap.set(ns.coach_id, entry);
  }
  for (const [coachId, info] of Array.from(coachSessionMap.entries())) {
    const count = info.dates.length;
    const firstDt = info.dates.sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
    const lastDt = info.dates[info.dates.length - 1];
    const range = count === 1
      ? `on ${formatSgtDate(firstDt)} at ${formatSgtTime(firstDt)}`
      : `from ${formatSgtDate(firstDt)} to ${formatSgtDate(lastDt)}`;
    createNotification(
      coachId,
      "pt_created",
      "PT Sessions Copied",
      `${count} PT session${count > 1 ? "s" : ""} copied to next week ${range}.`
    ).catch((err) => console.error("Failed to create copy notification:", err));
  }

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

// Coach-facing: mark own PT session as completed or cancelled
export async function coachUpdatePtStatus(
  sessionId: string,
  newStatus: "completed" | "cancelled" | "no_show",
  signature?: SessionSignaturePayload
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  // Verify the session belongs to this coach
  const { data: session } = await admin
    .from("pt_sessions")
    .select("id, coach_id, scheduled_at, duration_minutes, package_id, status, member:users!pt_sessions_member_id_fkey(full_name)")
    .eq("id", sessionId)
    .eq("coach_id", user.id)
    .single();

  if (!session) throw new Error("Session not found or not assigned to you");

  // Update session status (plus signature fields when completing)
  const updatePayload: Record<string, unknown> = { status: newStatus };
  if (newStatus === "completed" && signature) {
    updatePayload.signed_on_paper = signature.signed_on_paper;
    updatePayload.client_signature = signature.signed_on_paper ? null : signature.client_signature || null;
    updatePayload.signed_at = new Date().toISOString();
    updatePayload.signed_by = user.id;
    if (signature.paid_amount != null) updatePayload.paid_amount = signature.paid_amount;
  }

  const { error } = await admin
    .from("pt_sessions")
    .update(updatePayload)
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

  // PT is personal — no admin blast. The coach who just updated already knows,
  // and other coaches/admins don't need pinged about PTs they're not on.

  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
}

// Coach reschedules their own PT session (date/time/duration only, future only)
export async function coachReschedulePtSession(
  sessionId: string,
  newScheduledAt: string,
  newDurationMinutes: number
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  // Verify session belongs to this coach
  const { data: session } = await admin
    .from("pt_sessions")
    .select("id, coach_id, scheduled_at, status")
    .eq("id", sessionId)
    .eq("coach_id", user.id)
    .single();

  if (!session) throw new Error("Session not found or not assigned to you");
  if (session.status === "completed" || session.status === "cancelled" || session.status === "no_show") {
    throw new Error("Cannot reschedule a resolved session");
  }
  if (new Date(newScheduledAt) < new Date()) {
    throw new Error("New time must be in the future");
  }

  // Update the session
  const { error } = await admin
    .from("pt_sessions")
    .update({
      scheduled_at: newScheduledAt,
      duration_minutes: newDurationMinutes,
      edited_by: user.id,
      edited_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);

  // PT is personal — no admin blast on coach self-reschedule.

  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
}

// Log a PT session: coach fills "what we did" + "focus next week" after the session.
// Coach who owns the session, or any admin, can write.
export async function logPtSession(
  sessionId: string,
  coachNotes: string,
  nextFocus: string
) {
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
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("pt_sessions")
    .select("id, coach_id")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found");

  const isOwnerCoach = session.coach_id === user.id;
  const isAdminUser = profile && isAdmin(profile.role as "admin" | "master_admin" | "coach" | "member");
  if (!isOwnerCoach && !isAdminUser) throw new Error("Not authorised to log this session");

  const { error } = await admin
    .from("pt_sessions")
    .update({
      coach_notes: coachNotes.trim() || null,
      next_focus: nextFocus.trim() || null,
      edited_by: user.id,
      edited_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);

  revalidatePath("/pt");
  revalidatePath("/");
  revalidatePath("/schedule");
  revalidatePath(`/pt/log/${sessionId}`);
}

// ── Contract draft actions ──

export type ContractDraft = {
  id: string;
  batch_id: string;
  client_name: string | null;
  client_phone: string | null;
  client_nric: string | null;
  coach_name: string | null;
  coach_id: string | null;
  total_sessions: number | null;
  sessions_used: number;
  price_per_session: number | null;
  total_price: number | null;
  payment_method: string | null;
  start_date: string | null;
  expiry_date: string | null;
  session_dates: string[];
  status: string;
  created_at: string;
};

// Fetch all pending drafts for review
export async function getPendingDrafts(): Promise<ContractDraft[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("pt_contract_drafts")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as ContractDraft[];
}

// Fetch a single draft by id
export async function getContractDraft(id: string): Promise<ContractDraft | null> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("pt_contract_drafts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as ContractDraft;
}

// Save a draft → creates or reuses PT client + creates package, marks draft as saved
export async function saveContractDraft(
  draftId: string,
  payload: {
    client_name: string;
    client_phone: string;
    coach_id: string;
    total_sessions: number;
    sessions_used: number;
    total_price: number | null;
    expiry_date: string | null;
    // If set, skip user insert and use this existing member's id
    existing_user_id?: string | null;
    // Optional payer (parent/guardian) — used when payer ≠ trainee
    guardian_name?: string | null;
    guardian_phone?: string | null;
  }
) {
  await requireAdmin();
  const admin = createAdminClient();

  // 1. Resolve the PT client — reuse existing member or create new
  let clientId: string;
  if (payload.existing_user_id) {
    const { data: existing, error: lookupErr } = await admin
      .from("users")
      .select("id, role")
      .eq("id", payload.existing_user_id)
      .single();
    if (lookupErr || !existing) {
      throw new Error("Selected client not found");
    }
    clientId = existing.id as string;
  } else {
    clientId = randomUUID();
    const { error: clientErr } = await admin.from("users").insert({
      id: clientId,
      full_name: payload.client_name,
      phone: payload.client_phone || null,
      role: "member",
      is_active: true,
      email: `pt_${clientId.slice(0, 8)}@jmt.local`,
    });
    if (clientErr) throw new Error(`Failed to create client: ${clientErr.message}`);
  }

  // 2. Create the PT package
  const { error: pkgErr } = await admin.from("pt_packages").insert({
    user_id: clientId,
    preferred_coach_id: payload.coach_id,
    total_sessions: payload.total_sessions,
    sessions_used: payload.sessions_used,
    price_paid: payload.total_price,
    expiry_date: payload.expiry_date || null,
    status: payload.sessions_used >= payload.total_sessions ? "completed" : "active",
    guardian_name: payload.guardian_name?.trim() || null,
    guardian_phone: payload.guardian_phone?.trim() || null,
  });
  if (pkgErr) throw new Error(`Failed to create package: ${pkgErr.message}`);

  // 3. Mark draft as saved
  await admin
    .from("pt_contract_drafts")
    .update({ status: "saved" })
    .eq("id", draftId);

  revalidatePath("/pt");
  return { clientId };
}

// Discard a draft
export async function discardContractDraft(draftId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  await admin
    .from("pt_contract_drafts")
    .update({ status: "discarded" })
    .eq("id", draftId);

  revalidatePath("/pt");
}

// -------- Duplicate client detection + merge --------

function normalisePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip all non-digits, then trim any leading country code (65) so we group
  // "+65 98340698" with "98340698".
  const digits = raw.replace(/\D/g, "");
  return digits.replace(/^65(?=\d{8}$)/, "");
}

export type DuplicateGroup = {
  phone: string;
  clients: Array<{
    id: string;
    full_name: string;
    phone: string | null;
    pt_pay_per_class: boolean;
    pt_default_price_per_class: number | null;
    session_count: number;
    package_count: number;
    created_at: string;
  }>;
};

export async function findDuplicateClients(): Promise<DuplicateGroup[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: clients, error } = await admin
    .from("users")
    .select("id, full_name, phone, pt_pay_per_class, pt_default_price_per_class, created_at")
    .eq("role", "member")
    .is("merged_into_id", null);

  if (error) throw new Error(error.message);

  // Group by normalised phone (skip blanks — can't dedupe without a phone).
  const groups = new Map<string, DuplicateGroup["clients"]>();
  for (const c of clients || []) {
    const key = normalisePhone(c.phone);
    if (!key) continue;
    const arr = groups.get(key) || [];
    arr.push({
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      pt_pay_per_class: !!c.pt_pay_per_class,
      pt_default_price_per_class: c.pt_default_price_per_class ?? null,
      session_count: 0,
      package_count: 0,
      created_at: c.created_at,
    });
    groups.set(key, arr);
  }

  const dupes = Array.from(groups.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([phone, clients]) => ({ phone, clients }));

  if (dupes.length === 0) return [];

  // Fetch session + package counts for the dupe candidates only.
  const allIds = dupes.flatMap(g => g.clients.map(c => c.id));

  const [sessCounts, pkgCounts] = await Promise.all([
    admin.from("pt_sessions").select("member_id").in("member_id", allIds),
    admin.from("pt_packages").select("user_id").in("user_id", allIds),
  ]);

  const sessMap = new Map<string, number>();
  for (const row of sessCounts.data || []) {
    sessMap.set(row.member_id, (sessMap.get(row.member_id) || 0) + 1);
  }
  const pkgMap = new Map<string, number>();
  for (const row of pkgCounts.data || []) {
    pkgMap.set(row.user_id, (pkgMap.get(row.user_id) || 0) + 1);
  }

  for (const g of dupes) {
    for (const c of g.clients) {
      c.session_count = sessMap.get(c.id) || 0;
      c.package_count = pkgMap.get(c.id) || 0;
    }
    // Sort by "has-more-data" first — the richer row is usually the keeper.
    g.clients.sort((a, b) => {
      const aScore = a.session_count + a.package_count;
      const bScore = b.session_count + b.package_count;
      if (aScore !== bScore) return bScore - aScore;
      return a.created_at.localeCompare(b.created_at);
    });
  }

  return dupes;
}

export type MergePayload = {
  full_name: string;
  phone: string | null;
  pt_pay_per_class: boolean;
  pt_default_price_per_class: number | null;
};

export async function mergeClients(
  winnerId: string,
  loserIds: string[],
  payload: MergePayload
): Promise<{ sessions_moved: number; packages_moved: number; contracts_moved: number; notifications_moved: number }> {
  await requireAdmin();
  if (!winnerId || loserIds.length === 0) throw new Error("Nothing to merge");
  if (loserIds.includes(winnerId)) throw new Error("Winner cannot also be a loser");

  const admin = createAdminClient();

  // Verify all ids are role=member and not already merged.
  const { data: rows, error: loadErr } = await admin
    .from("users")
    .select("id, role, merged_into_id")
    .in("id", [winnerId, ...loserIds]);
  if (loadErr) throw new Error(loadErr.message);
  if (!rows || rows.length !== loserIds.length + 1) throw new Error("One of the clients could not be loaded");
  for (const r of rows) {
    if (r.role !== "member") throw new Error("Merge only allowed between member profiles");
    if (r.merged_into_id) throw new Error("One of the clients was already merged — refresh");
  }

  // 1) Reassign pt_sessions.member_id
  const { data: sessMoved, error: sErr } = await admin
    .from("pt_sessions")
    .update({ member_id: winnerId })
    .in("member_id", loserIds)
    .select("id");
  if (sErr) throw new Error(`sessions: ${sErr.message}`);

  // 2) Reassign pt_packages.user_id
  const { data: pkgMoved, error: pErr } = await admin
    .from("pt_packages")
    .update({ user_id: winnerId })
    .in("user_id", loserIds)
    .select("id");
  if (pErr) throw new Error(`packages: ${pErr.message}`);

  // 3) Reassign pt_contracts.client_user_id
  const { data: ctMoved, error: cErr } = await admin
    .from("pt_contracts")
    .update({ client_user_id: winnerId })
    .in("client_user_id", loserIds)
    .select("id");
  if (cErr) throw new Error(`contracts: ${cErr.message}`);

  // 4) Reassign notifications.user_id (if any — usually coach-addressed so may be 0)
  const { data: notifMoved, error: nErr } = await admin
    .from("notifications")
    .update({ user_id: winnerId })
    .in("user_id", loserIds)
    .select("id");
  if (nErr) throw new Error(`notifications: ${nErr.message}`);

  // 5) Apply merged payload to winner.
  const { error: uErr } = await admin
    .from("users")
    .update({
      full_name: payload.full_name,
      phone: payload.phone,
      pt_pay_per_class: payload.pt_pay_per_class,
      pt_default_price_per_class: payload.pt_default_price_per_class,
    })
    .eq("id", winnerId);
  if (uErr) throw new Error(`winner update: ${uErr.message}`);

  // 6) Soft-delete losers.
  const { error: mErr } = await admin
    .from("users")
    .update({ merged_into_id: winnerId, is_active: false })
    .in("id", loserIds);
  if (mErr) throw new Error(`soft-delete: ${mErr.message}`);

  revalidatePath("/pt");
  revalidatePath("/");

  return {
    sessions_moved: sessMoved?.length || 0,
    packages_moved: pkgMoved?.length || 0,
    contracts_moved: ctMoved?.length || 0,
    notifications_moved: notifMoved?.length || 0,
  };
}
