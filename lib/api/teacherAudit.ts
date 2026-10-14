import { z } from "zod";
import { apiPost, validateApiResponse } from "./http";

export const TeacherAuditRecordResponseSchema = z
  .object({
    message: z.string().optional(),
    record: z.unknown().optional(),
  })
  .passthrough();
export type TeacherAuditRecordResponse = z.infer<typeof TeacherAuditRecordResponseSchema>;

export async function createTeacherAuditRecord(
  teacherId: string,
  payload: {
    category: string;
    customCategory: string | null;
    scoreImpact: number;
    academicYear: string;
    description?: string;
  }
) {
  const result = await apiPost<TeacherAuditRecordResponse>(
    `/api/teacher-audit/${teacherId}/records`,
    payload
  );
  return {
    ...result,
    data: validateApiResponse(TeacherAuditRecordResponseSchema, result.data, "createTeacherAuditRecord"),
  };
}
