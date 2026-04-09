"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationPanelProps {
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  LEAVE: "Leave",
  FEES: "Fees",
  CERTIFICATES: "Certificates",
  ATTENDANCE: "Attendance",
  WORKSHOPS: "Workshop",
  NEWS: "News Feed",
  CIRCULAR: "Circular",
  MARKS: "Marks",
  HOMEWORK: "Homework",
};

function getLeaveScope(title: string, message: string) {
  const text = `${title} ${message}`.toLowerCase();
  if (text.includes("student leave")) return "Student Leave";
  if (text.includes("teacher leave")) return "Teacher Leave";
  return "Leave";
}

function getNotificationCategory(type: string, title: string, message: string) {
  const normalizedType = (type || "").toUpperCase();
  if (normalizedType === "LEAVE") return getLeaveScope(title, message);
  return TYPE_LABELS[normalizedType] || normalizedType || "General";
}

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?take=100", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/mark-all-read", { method: "PATCH", credentials: "include" });
      await loadNotifications();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const markOneRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
      await loadNotifications();
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay - glass */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Panel - glassmorphism, 60% width on mobile, full height */}
      <aside className="relative w-[60%] min-w-[280px] sm:w-[420px] h-full flex flex-col
        bg-white/10 backdrop-blur-xl border-l border-white/20 shadow-2xl">

        {/* Header - glass */}
        <div className="flex items-center justify-between p-5
          bg-white/5 backdrop-blur-sm border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-white">Notifications</h2>
            <p className="text-sm text-white/60 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 space-y-3 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-white/60" />
              <span className="ml-2 text-sm text-white/60">Loading...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/50">
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationItem
                key={n.id}
                title={n.title}
                description={n.message}
                category={getNotificationCategory(n.type, n.title, n.message)}
                time={formatTime(n.createdAt)}
                priority={!n.isRead}
                isRead={n.isRead}
                onClick={() => markOneRead(n.id)}
              />
            ))
          )}
        </div>

        {/* Mark All Read - bottom button */}
        <div className="p-4 bg-white/5 backdrop-blur-sm border-t border-white/10">
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="w-full py-3 px-4 rounded-xl font-medium
              bg-white/10 backdrop-blur-sm border border-white/20
              text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed
              transition-all"
          >
            Mark All Read
          </button>
        </div>
      </aside>
    </div>
  );
}

function NotificationItem({
  title,
  description,
  category,
  time,
  priority,
  isRead,
  onClick,
}: {
  title: string;
  description: string;
  category: string;
  time: string;
  priority?: boolean;
  isRead?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl p-4
        bg-white/5 backdrop-blur-sm border border-white/10
        hover:bg-white/10 transition ${
        isRead ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium">{title}</h3>
        {priority && !isRead && (
          <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
            New
          </span>
        )}
      </div>

      <p className="text-[11px] text-blue-300 mt-1">{category}</p>

      <p className="text-sm text-gray-300 mt-1 line-clamp-2">
        {description}
      </p>

      <p className="text-xs text-gray-400 mt-2">
        {time}
      </p>
    </button>
  );
}
