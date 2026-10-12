import { z } from "zod";
import { apiGet, apiPatch, apiPost, apiRequest, validateApiResponse } from "./http";

export const CreateSchoolResponseSchema = z
  .object({
    message: z.string().optional(),
  })
  .passthrough();
export type CreateSchoolResponse = z.infer<typeof CreateSchoolResponseSchema>;

export type CreateSchoolPayload = {
  schoolName: string;
  email: string;
  password: string;
  address: string;
  location: string;
  phone?: string;
  billingMode?: "PARENT_SUBSCRIPTION" | "SCHOOL_PAID";
  parentSubscriptionAmount?: number;
  parentSubscriptionTrialDays?: number;
};

export async function createSchool(payload: CreateSchoolPayload, signal?: AbortSignal) {
  const result = await apiPost<CreateSchoolResponse>("/api/superadmin/schools/create", payload, { signal });
  return {
    ...result,
    data: validateApiResponse(CreateSchoolResponseSchema, result.data, "createSchool"),
  };
}

export const SchoolsListResponseSchema = z
  .object({
    message: z.string().optional(),
    schools: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type SchoolsListResponse = z.infer<typeof SchoolsListResponseSchema>;

export async function fetchSuperadminSchools(
  params: URLSearchParams,
  opts?: { cache?: RequestCache; signal?: AbortSignal }
) {
  const result = await apiGet<SchoolsListResponse>(`/api/superadmin/schools?${params.toString()}`, opts);
  return {
    ...result,
    data: validateApiResponse(SchoolsListResponseSchema, result.data, "fetchSuperadminSchools"),
  };
}

export const DeleteSchoolResponseSchema = z.object({
  message: z.string().optional(),
});
export type DeleteSchoolResponse = z.infer<typeof DeleteSchoolResponseSchema>;

export async function deleteSchool(schoolId: string, confirmName: string) {
  const result = await apiRequest<DeleteSchoolResponse>(`/api/superadmin/schools/${schoolId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schoolName: confirmName }),
    cache: "no-store",
  });
  return {
    ...result,
    data: validateApiResponse(DeleteSchoolResponseSchema, result.data, "deleteSchool"),
  };
}

export const UpdateSubscriptionResponseSchema = z.object({
  message: z.string().optional(),
  school: z
    .object({
      name: z.string().optional(),
      billingMode: z.string().optional(),
      parentSubscriptionAmount: z.number().nullable().optional(),
      parentSubscriptionTrialDays: z.number().optional(),
      isActive: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
});
export type UpdateSubscriptionResponse = z.infer<typeof UpdateSubscriptionResponseSchema>;

export async function updateSchoolSubscription(schoolId: string, payload: Record<string, unknown>) {
  const result = await apiPatch<UpdateSubscriptionResponse>(
    `/api/superadmin/schools/${schoolId}/subscription`,
    payload
  );
  return {
    ...result,
    data: validateApiResponse(UpdateSubscriptionResponseSchema, result.data, "updateSchoolSubscription"),
  };
}
