import { z } from "zod";
import { apiDelete, apiPatch, apiPost, validateApiResponse } from "./http";

export const ExtraFeeSaveResponseSchema = z.object({
  message: z.string().optional(),
});
export type ExtraFeeSaveResponse = z.infer<typeof ExtraFeeSaveResponseSchema>;

export const CleanupDuplicatesResponseSchema = z.object({
  message: z.string().optional(),
  removedDuplicateRows: z.number().optional(),
  remainingDuplicateCount: z.number().optional(),
  studentsRecalculated: z.number().optional(),
});
export type CleanupDuplicatesResponse = z.infer<typeof CleanupDuplicatesResponseSchema>;

export async function patchExtraFee(targetId: string, body: Record<string, unknown>) {
  const result = await apiPatch<ExtraFeeSaveResponse>(`/api/fees/extra/${targetId}`, body);
  return {
    ...result,
    data: validateApiResponse(ExtraFeeSaveResponseSchema, result.data, "patchExtraFee"),
  };
}

export async function createExtraFee(body: Record<string, unknown>) {
  const result = await apiPost<ExtraFeeSaveResponse>("/api/fees/extra", body);
  return {
    ...result,
    data: validateApiResponse(ExtraFeeSaveResponseSchema, result.data, "createExtraFee"),
  };
}

export async function batchAssignExtraFees(payload: { studentId: string; fees: unknown[] }) {
  const result = await apiPost<ExtraFeeSaveResponse>("/api/fees/extra/batch-assign", payload);
  return {
    ...result,
    data: validateApiResponse(ExtraFeeSaveResponseSchema, result.data, "batchAssignExtraFees"),
  };
}

export async function deleteExtraFee(id: string) {
  const result = await apiDelete<ExtraFeeSaveResponse>(`/api/fees/extra/${id}`);
  return {
    ...result,
    data: validateApiResponse(ExtraFeeSaveResponseSchema, result.data, "deleteExtraFee"),
  };
}

export async function cleanupExtraFeeDuplicates() {
  const result = await apiPost<CleanupDuplicatesResponse>("/api/fees/extra/cleanup-duplicates");
  return {
    ...result,
    data: validateApiResponse(CleanupDuplicatesResponseSchema, result.data, "cleanupExtraFeeDuplicates"),
  };
}
