"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NotificationType } from "@/lib/types/database";

// Insert a notification for a coach (called server-side by admin actions)
export async function createNotification(
  recipientId: string,
  type: NotificationType,
  title: string,
  message: string
) {
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    recipient_id: recipientId,
    type,
    title,
    message,
  });
}

// Fetch notifications for the current user
export async function getMyNotifications(limit = 30) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}

// Get unread count for current user
export async function getUnreadCount() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .eq("read", false);

  return count || 0;
}

// Mark a single notification as read
export async function markNotificationRead(notificationId: string) {
  const supabase = createClient();
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);
}

// Mark all notifications as read for current user
export async function markAllNotificationsRead() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", user.id)
    .eq("read", false);
}
