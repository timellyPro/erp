import { apiGet } from "./http";

export interface SuperadminDashboardData {
  stats: { totalSchools: number; totalStudents: number; totalTeachers: number };
  schools: Array<{
    id: string;
    name: string;
    location: string;
    photoUrl?: string | null;
    studentCount: number;
    teacherCount: number;
    classCount: number;
  }>;
  feeTransactions: Array<{
    id: string;
    slNo: number;
    amount: number;
    schoolId: string;
    schoolName: string;
    studentName: string;
    createdAt: string;
  }>;
}

export type SuperadminDashboardResponse = SuperadminDashboardData & {
  message?: string;
};

export function fetchSuperadminDashboard() {
  return apiGet<SuperadminDashboardResponse>("/api/superadmin/dashboard", { cache: "no-store" });
}
