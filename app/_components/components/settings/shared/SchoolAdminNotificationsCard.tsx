import { Bell } from "lucide-react";
import { CardTitle } from "../SettingsPrimitives";
import { CARD_BODY_CLASS, CARD_CLASS, CARD_HEADER_CLASS } from "../portalSettingsTypes";

export interface SchoolAdminNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export function SchoolAdminNotificationsCard({
  notifications,
  unreadCount,
  loading,
  onMarkRead,
  formatTime,
}: {
  notifications: SchoolAdminNotification[];
  unreadCount: number;
  loading: boolean;
  onMarkRead: (id: string) => void;
  formatTime: (dateString: string) => string;
}) {
  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <CardTitle icon={<Bell className="text-lime-300" size={22} />} title="Notifications" subtitle={`${unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}`} />
      </div>
      <div className={CARD_BODY_CLASS}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="ml-2 text-sm text-white/60">Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/40">
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                className={`w-full text-left rounded-xl bg-white/5 p-4 border border-white/10 hover:bg-white/10 transition ${
                  n.isRead ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium">{n.title}</h3>
                  {!n.isRead && (
                    <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                      New
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 mt-1 line-clamp-2">
                  {n.message}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {formatTime(n.createdAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
