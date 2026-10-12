"use client";

import { useEffect, useState } from "react";
import { fetchNotifications, markNotificationRead } from "@/lib/api/notifications";
import { CommonSettingsProps } from "./portalSettingsTypes";
import { SchoolAdminAccountCard } from "./shared";
import { SchoolEmailDomainCard } from "./shared";
import { SchoolHyperPGCredentialsCard } from "./shared";
import { SchoolAdminPasswordCard } from "./shared";
import {
  SchoolAdminNotificationsCard,
  type SchoolAdminNotification,
} from "./shared";

export default function SchoolAdminSettingsView({
  form,
  setForm,
  passwords,
  setPasswords,
  fileInputRef,
  handleUploadAvatar,
  uploading,
}: CommonSettingsProps) {
  const [notifications, setNotifications] = useState<SchoolAdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        setLoadingNotifications(true);
        const { ok, data } = await fetchNotifications(10);
        if (ok) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (error) {
        console.error("Failed to load notifications:", error);
      } finally {
        setLoadingNotifications(false);
      }
    };
    loadNotifications();
  }, []);

  const markOneRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
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
    <div className="space-y-6">
      <SchoolAdminAccountCard
        form={form}
        setForm={setForm}
        fileInputRef={fileInputRef}
        handleUploadAvatar={handleUploadAvatar}
        uploading={uploading}
      />
      <SchoolEmailDomainCard />
      <SchoolHyperPGCredentialsCard />
      <SchoolAdminPasswordCard passwords={passwords} setPasswords={setPasswords} />
      <SchoolAdminNotificationsCard
        notifications={notifications}
        unreadCount={unreadCount}
        loading={loadingNotifications}
        onMarkRead={markOneRead}
        formatTime={formatTime}
      />
    </div>
  );
}
