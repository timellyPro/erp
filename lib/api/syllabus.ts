import { apiPost } from "./http";

export type SyllabusMutationResponse = {
  message?: string;
};

export function addSyllabusSubject(termId: string, subject: string) {
  return apiPost<SyllabusMutationResponse>(`/api/exams/terms/${termId}/syllabus`, { subject });
}

export function addSyllabusUnit(
  termId: string,
  payload: { subject: string; unitName: string; order: number }
) {
  return apiPost<SyllabusMutationResponse>(`/api/exams/terms/${termId}/syllabus/units`, payload);
}
