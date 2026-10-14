import { apiPost } from "./http";

export type ExamScheduleMutationResponse = {
  message?: string;
};

export function addExamSchedule(
  termId: string,
  payload: { subject: string; examDate: string; startTime: string; durationMin: number }
) {
  return apiPost<ExamScheduleMutationResponse>(`/api/exams/terms/${termId}/schedule`, payload);
}
