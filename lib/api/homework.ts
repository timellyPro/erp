import { apiDelete, apiGet, apiPost, apiPut } from "./http";

export type HomeworkMutationResponse = {
  message?: string;
  homework?: { id: string };
} & Record<string, unknown>;

export type HomeworkPayload = {
  title: string;
  description: string;
  classId: string;
  subject: string;
  dueDate: string;
  assignedDate: string;
  file?: string | null;
};

export function createHomework(payload: HomeworkPayload) {
  const body: Record<string, unknown> = { ...payload };
  if (payload.file === undefined) delete body.file;
  return apiPost<HomeworkMutationResponse>("/api/homework/create", body);
}

export function updateHomework(id: string, payload: HomeworkPayload) {
  const body: Record<string, unknown> = { ...payload };
  if (payload.file === undefined) delete body.file;
  return apiPut<HomeworkMutationResponse>(`/api/homework/${id}`, body);
}

export type DeleteHomeworkResponse = {
  message?: string;
};

export function deleteHomework(id: string) {
  return apiDelete<DeleteHomeworkResponse>(`/api/homework/${id}`);
}

export type HomeworkSubmissionsResponse = {
  message?: string;
  homework?: { title?: string };
  submissions?: Array<{
    id: string;
    content: string | null;
    fileUrl: string | null;
    submittedAt: string;
    studentId: string;
    studentName: string;
    admissionNumber: string;
    rollNo: string | null;
  }>;
};

export function fetchHomeworkSubmissions(homeworkId: string) {
  return apiGet<HomeworkSubmissionsResponse>(`/api/homework/${homeworkId}/submissions`);
}
