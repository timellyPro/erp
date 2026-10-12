import { apiGet } from "./http";

export type TeacherListResponse = {
  message?: string;
  teachers?: {
    id: string;
    name: string;
    email: string;
    mobile?: string | null;
  }[];
};

export function fetchTeacherList() {
  return apiGet<TeacherListResponse>("/api/teacher/list");
}

export type TeacherDetails = {
  id: string;
  name: string | null;
  email: string | null;
  teacherId: string | null;
  subject: string | null;
  subjects: string[] | null;
  qualification: string | null;
  experience: string | null;
  joiningDate: string | null;
  teacherStatus: string | null;
  mobile: string | null;
  address: string | null;
  assignedClasses?: { id: string; name: string; section: string | null }[];
};

export type TeacherDetailsResponse = {
  message?: string;
  teacher?: TeacherDetails | null;
};

export function fetchTeacherDetails(id: string) {
  return apiGet<TeacherDetailsResponse>(`/api/teacher/${id}`);
}
