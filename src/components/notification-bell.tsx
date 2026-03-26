"use client";

import { useState, useEffect, useRef } from "react";
import { Notification } from "@/lib/types/database";
import {
  getMyNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/actions/notifications";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getTypeIcon(type: string): string {
  switch (type) {
    case "class_assigned":
      return "📋";
    case "pt_scheduled":
      return "🏋️";
    case "class_cancelled":
      return "❌";
    case "class_updated":
      return "✏️";
    default:
      return "🔔";
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount and poll every 30s
  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      const count = await getUnreadCount();
      if (mounted) setUnreadCount(count);
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleOpen = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    const data = await getMyNotifications();
    setNotifications(data as Notification[]);
    setLoading(false);
  };

  const handleClickNotification = async (n: Notification) => {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 text-jai-text hover:text-white transition-colors"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] bg-jai-card border border-jai-border rounded-xl shadow-2xl z-[100] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-jai-border">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-jai-blue hover:text-jai-blue/80 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-6 text-center text-jai-text text-sm">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-jai-text text-sm">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-left px-4 py-3 border-b border-jai-border last:border-b-0 transition-colors hover:bg-white/5 ${
                    !n.read ? "bg-jai-blue/5" : ""
                  }`}
                >
                  <div className="flex gap-2.5">
                    <span className="text-base mt-0.5 flex-shrink-0">{getTypeIcon(n.type)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate ${!n.read ? "text-white" : "text-jai-text"}`}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="w-2 h-2 bg-jai-blue rounded-full flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-jai-text mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-jai-text/60 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
