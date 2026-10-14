import { apiGet } from "./http";

export type ExamTypesResponse = {
  examTypes?: unknown;
};

export function fetchExamTypes() {
  return apiGet<ExamTypesResponse>("/api/exam-types", { cache: "no-store" });
}
