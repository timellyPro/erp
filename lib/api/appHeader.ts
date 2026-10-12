import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

export const CurrentUserResponseSchema = z.object({
  user: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      role: z.string().optional(),
      email: z.string().optional(),
      mobile: z.string().optional(),
      address: z.string().nullable().optional(),
      photoUrl: z.string().nullable().optional(),
    })
    .optional(),
});
export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;

export const ParentDetailsResponseSchema = z.object({
  address: z.string().optional(),
});
export type ParentDetailsResponse = z.infer<typeof ParentDetailsResponseSchema>;

export const UnreadNotificationsResponseSchema = z.object({
  unreadCount: z.number().optional(),
});
export type UnreadNotificationsResponse = z.infer<typeof UnreadNotificationsResponseSchema>;

export async function fetchUnreadNotificationsCount(signal?: AbortSignal) {
  const result = await apiGet<UnreadNotificationsResponse>("/api/notifications?take=1", {
    cache: "no-store",
    signal,
  });
  return {
    ...result,
    data: validateApiResponse(UnreadNotificationsResponseSchema, result.data, "fetchUnreadNotificationsCount"),
  };
}

export async function fetchCurrentUser(opts?: { cache?: RequestCache }) {
  const result = await apiGet<CurrentUserResponse>("/api/user/me", { cache: opts?.cache });
  return {
    ...result,
    data: validateApiResponse(CurrentUserResponseSchema, result.data, "fetchCurrentUser"),
  };
}

export async function fetchParentDetails() {
  const result = await apiGet<ParentDetailsResponse>("/api/student/parent-details");
  return {
    ...result,
    data: validateApiResponse(ParentDetailsResponseSchema, result.data, "fetchParentDetails"),
  };
}
