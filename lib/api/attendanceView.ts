import { apiGet } from "./http";

export type AttendanceViewRecord = {
  studentId: string;
  status: string;
};

export type AttendanceViewResponse = {
  attendances?: AttendanceViewRecord[];
};

export function fetchClassAttendanceView(classId: string) {
  return apiGet<AttendanceViewResponse>(`/api/attendance/view?classId=${classId}`);
}
