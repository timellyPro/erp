import { z } from "zod";
import { apiDelete, apiPut, apiRequest, validateApiResponse } from "./http";

export const DeleteUserResponseSchema = z.object({
  message: z.string().optional(),
});
export type DeleteUserResponse = z.infer<typeof DeleteUserResponseSchema>;

export async function deleteUser(id: string) {
  const result = await apiDelete<DeleteUserResponse>(`/api/user/${id}`);
  return {
    ...result,
    data: validateApiResponse(DeleteUserResponseSchema, result.data, "deleteUser"),
  };
}

export type BulkImportUsersResponse = {
  message?: string;
  successful?: number;
  failed?: number;
  errors?: string[];
};

/**
 * Multipart file upload — apiPost forces a JSON content-type header, which
 * would break the browser's multipart boundary, so this goes through
 * apiRequest directly and lets fetch set the header from the FormData body.
 */
export function bulkImportUsers(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<BulkImportUsersResponse>("/api/user/bulk-import", {
    method: "POST",
    body: formData,
  });
}

export type UpdateUserResponse = {
  message?: string;
  user?: {
    name?: string;
    teacherId?: string;
    subject?: string;
    designation?: string;
    mobile?: string;
    photoUrl?: string;
  };
};

export type UpdateMyProfileResponse = {
  message?: string;
} & Record<string, unknown>;

export function updateMyProfile(payload: {
  name: string;
  mobile: string;
  address: string;
  qualification: string;
  experience: string;
  photoUrl: string | null;
  teacherId: string;
  subject: string;
}) {
  return apiPut<UpdateMyProfileResponse>("/api/user/me", payload);
}

export function updateUser(
  id: string,
  payload: {
    name: string;
    teacherId: string;
    designation: string;
    mobile: string;
    photoUrl: string;
  }
) {
  return apiPut<UpdateUserResponse>(`/api/user/${id}`, payload);
}
