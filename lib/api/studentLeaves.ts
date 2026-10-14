import { z } from "zod";
import { apiGet, apiPatch, apiPost, validateApiResponse } from "./http";

const LeaveRecordSchema = z.object({
  id: z.string(),
  leaveType: z.string(),
  reason: z.string().nullable(),
  fromDate: z.string(),
  toDate: z.string(),
  status: z.string(),
  remarks: z.string().nullable(),
  createdAt: z.string(),
});
export type LeaveRecord = z.infer<typeof LeaveRecordSchema>;

export const MyLeavesResponseSchema = z.array(LeaveRecordSchema);
export type MyLeavesResponse = z.infer<typeof MyLeavesResponseSchema>;

export const ApprovalAuthorityResponseSchema = z
  .object({
    teacherId: z.string().nullable().optional(),
    teacherName: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    className: z.string().nullable().optional(),
    section: z.string().nullable().optional(),
  })
  .nullable();
export type ApprovalAuthorityResponse = z.infer<typeof ApprovalAuthorityResponseSchema>;

export type ApplyLeaveResponse = {
  message?: string;
  leave?: LeaveRecord;
};

export async function fetchMyStudentLeaves() {
  const result = await apiGet<unknown>("/api/student-leaves/my");
  return {
    ...result,
    data: validateApiResponse(MyLeavesResponseSchema, result.data, "fetchMyStudentLeaves"),
  };
}

export async function fetchLeaveApprovalAuthority() {
  const result = await apiGet<ApprovalAuthorityResponse>("/api/student-leaves/approval-authority");
  return {
    ...result,
    data: validateApiResponse(ApprovalAuthorityResponseSchema, result.data, "fetchLeaveApprovalAuthority"),
  };
}

export function applyStudentLeave(payload: {
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
}) {
  return apiPost<ApplyLeaveResponse>("/api/student-leaves/apply", payload);
}

export type LeaveActionResponse = {
  message?: string;
  leave?: unknown;
};

export function approveStudentLeave(id: string) {
  return apiPatch<LeaveActionResponse>(`/api/student-leaves/${id}/approve`);
}

export function rejectStudentLeave(id: string) {
  return apiPatch<LeaveActionResponse>(`/api/student-leaves/${id}/reject`, {});
}
