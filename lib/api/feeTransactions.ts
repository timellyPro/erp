import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";

export const ClassDetailResponseSchema = z.object({
  class: z
    .object({
      students: z
        .array(
          z.object({
            id: z.string(),
            admissionNumber: z.string(),
            user: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
            class: z.object({ section: z.string().nullable().optional() }).nullable().optional(),
          })
        )
        .optional(),
    })
    .optional(),
});
export type ClassDetailResponse = z.infer<typeof ClassDetailResponseSchema>;

export const FeeCollectorsResponseSchema = z.object({
  collectors: z.array(z.object({ userId: z.string(), name: z.string() })).optional(),
});
export type FeeCollectorsResponse = z.infer<typeof FeeCollectorsResponseSchema>;

export async function fetchClassDetail(classId: string) {
  const result = await apiGet<ClassDetailResponse>(`/api/class/${encodeURIComponent(classId)}`);
  return {
    ...result,
    data: validateApiResponse(ClassDetailResponseSchema, result.data, "fetchClassDetail"),
  };
}

export async function fetchFeeCollectors(signal?: AbortSignal) {
  const result = await apiGet<FeeCollectorsResponse>("/api/fees/collectors", { signal });
  return {
    ...result,
    data: validateApiResponse(FeeCollectorsResponseSchema, result.data, "fetchFeeCollectors"),
  };
}
