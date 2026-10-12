import { apiPatch } from "./http";

export type LeaveActionResponse = {
  message?: string;
  [key: string]: unknown;
};

export function approveTeacherLeave(id: string, type: "FULL" | "CONDITIONAL", remarks?: string) {
  return apiPatch<LeaveActionResponse>(`/api/leaves/${id}/approve`, { type, remarks });
}

export function rejectTeacherLeave(id: string, remarks: string) {
  return apiPatch<LeaveActionResponse>(`/api/leaves/${id}/reject`, { remarks });
}
