"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramAlertToUser } from "@/lib/telegram-alert";

// Insert a notification for a user. If the recipient is opted in via the
// JMT_TELEGRAM_USER_MAP env var, also fire a Telegram DM so they get pinged
// instantly without having to open the web app.
export async function createNotification(
  recipientId: string,
  notificationType: string,
  title: string,
  message: string
) {
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    user_id: recipientId,
    notification_type: notificationType,
    title,
    message,
    is_read: false,
  });
  if (error) {
    console.error("createNotification error:", error);
    throw error;
  }

  // Fire Telegram DM if recipient is mapped (non-blocking).
  // Each call sends exactly one message, so notifications stay 1:1.
  try {
    await sendTelegramAlertToUser(recipientId, title, message);
  } catch (err) {
    console.error("Telegram alert failed:", err);
  }
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
    .eq("user_id", user.id)
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
    .eq("user_id", user.id)
    .eq("is_read", false);

  return count || 0;
}

// Mark a single notification as read
export async function markNotificationRead(notificationId: string) {
  const supabase = createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
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
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);
}
