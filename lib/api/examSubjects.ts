import { apiGet } from "./http";

export type ExamSubjectsResponse = {
  subjects?: string[];
};

export function fetchExamSubjects() {
  return apiGet<ExamSubjectsResponse>("/api/exam-subjects", {
    cache: "no-store",
  });
}
