import { z } from "zod";
import { apiGet, apiPut, apiPost, validateApiResponse } from "./http";

export const UserMeResponseSchema = z.object({
  user: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      mobile: z.string().nullable(),
      address: z.string().nullable(),
      language: z.string().nullable(),
      photoUrl: z.string().nullable(),
    })
    .optional(),
  message: z.string().optional(),
});
export type UserMeResponse = z.infer<typeof UserMeResponseSchema>;

export const ParentDetailsResponseSchema = z.record(z.string(), z.string().nullable().optional());
export type ParentDetailsResponse = z.infer<typeof ParentDetailsResponseSchema> & {
  message?: string;
};

export type SaveUserProfilePayload = {
  name: string;
  mobile: string | null;
  address: string | null;
  language: string;
  photoUrl: string | null;
};

export type SaveParentDetailsPayload = {
  address: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  occupation: string | null;
};

export async function fetchCurrentUserSettings() {
  const result = await apiGet<UserMeResponse>("/api/user/me");
  return {
    ...result,
    data: validateApiResponse(UserMeResponseSchema, result.data, "fetchCurrentUserSettings"),
  };
}

export function fetchParentDetailsSettings() {
  // Free-form record (fatherName/fatherPhone/motherName/occupation/address)
  // — validated loosely as a string-keyed record rather than a fixed shape.
  return apiGet<ParentDetailsResponse>("/api/student/parent-details");
}

export async function saveUserProfile(payload: SaveUserProfilePayload) {
  const result = await apiPut<UserMeResponse>("/api/user/me", payload);
  return {
    ...result,
    data: validateApiResponse(UserMeResponseSchema, result.data, "saveUserProfile"),
  };
}

export function saveParentDetails(payload: SaveParentDetailsPayload) {
  return apiPut<ParentDetailsResponse>("/api/student/parent-details", payload);
}

export function changePassword(payload: { currentPassword: string; newPassword: string }) {
  return apiPost<{ message?: string }>("/api/user/change-password", payload);
}
