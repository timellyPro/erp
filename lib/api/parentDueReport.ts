import type { StudentFeeDueReport } from "@/lib/fees/buildStudentFeeDueReport";
import { apiGet } from "./http";

export type ParentDueReportResponse = { message?: string; report?: StudentFeeDueReport };

export function fetchMyDueReport() {
  return apiGet<ParentDueReportResponse>("/api/parent/due-report", { cache: "no-store" });
}
