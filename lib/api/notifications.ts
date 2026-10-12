import { z } from "zod";
import { apiGet, apiPatch, validateApiResponse } from "./http";

const NotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  isRead: z.boolean(),
  createdAt: z.string(),
});

export const NotificationsListResponseSchema = z.object({
  notifications: z.array(NotificationSchema).optional(),
  unreadCount: z.number().optional(),
});
export type NotificationsListResponse = z.infer<typeof NotificationsListResponseSchema>;

export async function fetchNotifications(take: number, signal?: AbortSignal) {
  const result = await apiGet<NotificationsListResponse>(`/api/notifications?take=${take}`, {
    cache: "no-store",
    signal,
  });
  return {
    ...result,
    data: validateApiResponse(NotificationsListResponseSchema, result.data, "fetchNotifications"),
  };
}

export function markAllNotificationsRead() {
  return apiPatch("/api/notifications/mark-all-read");
}

export function markNotificationRead(id: string) {
  return apiPatch(`/api/notifications/${id}/read`);
}
