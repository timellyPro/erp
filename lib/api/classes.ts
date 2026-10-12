import { z } from "zod";
import { apiDelete, apiGet, apiPost, apiPut, apiRequest, validateApiResponse } from "./http";

export const ClassMutationResponseSchema = z.object({
  message: z.string().optional(),
  class: z
    .object({
      id: z.string(),
      name: z.string(),
      section: z.string(),
      teacherId: z.string().nullable().optional(),
      teacher: z.object({ name: z.string().nullable().optional(), email: z.string().nullable().optional() }).nullable().optional(),
    })
    .passthrough()
    .optional(),
});
export type ClassMutationResponse = z.infer<typeof ClassMutationResponseSchema>;

export async function deleteClass(id: string) {
  const result = await apiDelete<ClassMutationResponse>(`/api/class/${id}`);
  return {
    ...result,
    data: validateApiResponse(ClassMutationResponseSchema, result.data, "deleteClass"),
  };
}

export async function updateClass(
  id: string,
  payload: { name: string; section: string; teacherId?: string | null }
) {
  const result = await apiPut<ClassMutationResponse>(`/api/class/${id}`, payload);
  return {
    ...result,
    data: validateApiResponse(ClassMutationResponseSchema, result.data, "updateClass"),
  };
}

export async function createClass(payload: {
  name: string;
  section?: string;
  teacherId?: string;
}) {
  const result = await apiPost<ClassMutationResponse>("/api/class/create", payload);
  return {
    ...result,
    data: validateApiResponse(ClassMutationResponseSchema, result.data, "createClass"),
  };
}

export const ClassDetailsResponseSchema = z.object({
  message: z.string().optional(),
  class: z
    .object({
      id: z.string(),
      name: z.string(),
      section: z.string(),
      teacher: z.object({ id: z.string(), name: z.string().nullable().optional() }).nullable().optional(),
    })
    .passthrough()
    .optional(),
});
export type ClassDetailsResponse = z.infer<typeof ClassDetailsResponseSchema>;

export async function fetchClass(id: string) {
  const result = await apiGet<ClassDetailsResponse>(`/api/class/${id}`);
  return {
    ...result,
    data: validateApiResponse(ClassDetailsResponseSchema, result.data, "fetchClass"),
  };
}

export type ClassCsvUploadResponse = {
  message?: string;
  createdCount?: number;
  failedCount?: number;
};

/**
 * Multipart file upload — apiPost forces a JSON content-type header, which
 * would break the browser's multipart boundary, so this goes through
 * apiRequest directly and lets fetch set the header from the FormData body.
 */
export function uploadClassesCsv(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<ClassCsvUploadResponse>("/api/class/bulk-upload", {
    method: "POST",
    body: formData,
  });
}
