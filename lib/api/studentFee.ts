import { z } from "zod";
import { apiPatch, validateApiResponse } from "./http";

export const ModifyStudentFeeResponseSchema = z
  .object({
    message: z.string().optional(),
    pendingApproval: z.boolean().optional(),
  })
  .passthrough();
export type ModifyStudentFeeResponse = z.infer<typeof ModifyStudentFeeResponseSchema>;

export async function modifyStudentFee(studentId: string, payload: Record<string, unknown>) {
  const result = await apiPatch<ModifyStudentFeeResponse>(`/api/fees/student/${studentId}`, payload);
  return {
    ...result,
    data: validateApiResponse(ModifyStudentFeeResponseSchema, result.data, "modifyStudentFee"),
  };
}
