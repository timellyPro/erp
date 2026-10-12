import { z } from "zod";
import { apiGet, apiPost, validateApiResponse } from "./http";

export type SaveTeacherAttendanceResponse = {
  message?: string;
};

export const TeacherAttendanceResponseSchema = z.object({
  attendances: z.array(z.object({ teacherId: z.string(), status: z.string() })).optional(),
});
export type TeacherAttendanceResponse = z.infer<typeof TeacherAttendanceResponseSchema>;

export function saveTeacherAttendance(
  date: string,
  attendances: Array<{ teacherId: string; status: string }>
) {
  return apiPost<SaveTeacherAttendanceResponse>("/api/teacher/attendance", { date, attendances });
}

export async function fetchTeacherAttendanceForDate(date: string) {
  const result = await apiGet<TeacherAttendanceResponse>(`/api/teacher/attendance?date=${date}`);
  return {
    ...result,
    data: validateApiResponse(TeacherAttendanceResponseSchema, result.data, "fetchTeacherAttendanceForDate"),
  };
}
