"use client";

import { CircleAlert, MessageSquare } from "lucide-react";
import { formatRelativeTime } from "../../../../utils/format";
import { TeacherDashboardData } from "./types";

type Props = {
  notifications: TeacherDashboardData["notifications"];
  recentChats: TeacherDashboardData["recentChats"];
  onOpenChat: () => void;
};

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

function notificationTypeLabel(type: string, title: string, message: string) {
  const normalizedType = (type || "").toUpperCase();
  if (normalizedType === "LEAVE") {
    const text = `${title} ${message}`.toLowerCase();
    if (text.includes("student leave")) return "Student Leave";
    if (text.includes("teacher leave")) return "Teacher Leave";
    return "Leave";
  }
  return TYPE_LABELS[normalizedType] || normalizedType || "General";
}

export default function TeacherDashboardSideColumn({
  notifications,
  recentChats,
  onOpenChat,
}: Props) {
  return (
    <div className="space-y-4 lg:sticky lg:top-6">
      <section className="rounded-2xl border border-white/10 background-blur-2xl bg-white/5 p-6 min-h-[500px]">
        <h3 className="text-xl font-semibold text-white">Notifications</h3>
        <p className="text-sm text-white/60 mt-1">Recent alerts and updates</p>

        <div className="mt-4 space-y-3 divide-y divide-white/5 overflow-y-auto max-h-[400px] no-scrollbar">
          {notifications.length === 0 ? (
            <div className="text-sm text-white/50 py-6 text-center">No notifications available.</div>
          ) : (
            notifications.map((n) => (
              <article
                key={n.id}
                className="flex gap-3 p-4 hover:bg-white/5 transition-all cursor-pointer group"
              >
                <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 h-8">
                  <CircleAlert size={16} />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-200 text-sm group-hover:text-white transition-colors truncate">
                    {n.title}
                  </h4>
                  <p className="text-[11px] text-blue-300 mt-1">
                    {notificationTypeLabel(n.type, n.title, n.message)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-gray-600 mt-2 uppercase tracking-wider">
                    {formatRelativeTime(n.createdAt)}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="min-h-[500px] rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white">Recent Parent Chats</h3>
            <p className="text-sm text-white/60 mt-1">Latest messages from parents</p>
          </div>
          <button
            type="button"
            onClick={onOpenChat}
            className="px-3 py-1.5 bg-lime-400/10 hover:bg-lime-400/20 text-lime-400 border border-lime-400/20 rounded-lg font-medium transition-all text-xs"
          >
            View All
          </button>
        </div>

        <div className="mt-4 space-y-3 divide-y divide-white/5 overflow-y-auto no-scrollbar">
          {recentChats.length === 0 ? (
            <div className="text-sm text-white/50 py-6 text-center">No recent chats.</div>
          ) : (
            recentChats.map((chat) => (
              <article
                key={chat.id}
                className="flex items-start gap-4 p-4 hover:bg-white/5 transition-all cursor-pointer group"
              >
                <div className="p-2.5 bg-white/5 rounded-xl text-gray-400 group-hover:bg-lime-400/10 group-hover:text-lime-400 transition-all border border-white/5">
                  <MessageSquare size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-200 text-sm truncate group-hover:text-white">
                    {chat.parentName}
                  </h4>
                  <p className="text-xs text-lime-400/80 mb-1 truncate">Parent of {chat.studentName}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {chat.note || "No message preview available."}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-2 uppercase tracking-wider">
                    {formatRelativeTime(chat.createdAt)}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
