import { apiGet, apiPost, apiPut } from "./http";

// The route can respond with either a bare array or { terms: [...] } — this
// stays untyped/passthrough here to preserve that existing (if inconsistent)
// behavior rather than silently picking one shape to enforce.
export type ExamTermsResponse = unknown;

export function fetchExamTerms() {
  return apiGet<ExamTermsResponse>("/api/exams/terms");
}

export function fetchExamTermsByClass(classId: string) {
  return apiGet<ExamTermsResponse>(`/api/exams/terms?classId=${encodeURIComponent(classId)}`, {
    cache: "no-store",
  });
}

export type ExamTermMutationResponse = {
  message?: string;
  term?: { id?: string };
};

export type ExamTermPayload = {
  name: string;
  description: string | null;
  classId: string;
  status: string;
};

export function createExamTerm(payload: ExamTermPayload) {
  return apiPost<ExamTermMutationResponse>("/api/exams/terms", payload);
}

export function updateExamTerm(termId: string, payload: ExamTermPayload) {
  return apiPut<ExamTermMutationResponse>(`/api/exams/terms/${termId}`, payload);
}
