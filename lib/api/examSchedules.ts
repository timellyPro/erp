import { apiDelete, apiGet } from "./http";

export type ExamScheduleDetailResponse = {
  message?: string;
  exam?: unknown;
};

export function fetchExamScheduleDetail(examId: string) {
  return apiGet<ExamScheduleDetailResponse>(`/api/exams/schedules/${examId}`);
}

export type DeleteExamScheduleResponse = {
  message?: string;
};

export function deleteExamSchedule(examId: string) {
  return apiDelete<DeleteExamScheduleResponse>(`/api/exams/schedules/${examId}`);
}
