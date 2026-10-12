import type { Class, FeeRecord } from "../types";

export const PAGE_SIZE = 20;

export interface FeeRecordsTableProps {
  fees: FeeRecord[];
  classes: Class[];
}

export type ReportPeriod = "DAY_WISE" | "MONTH_WISE" | "YEAR_WISE" | "ACADEMIC_YEAR_WISE";
export type ExportFormat = "xlsx" | "csv" | "pdf";
export type StudentStatusFilter = "Active" | "Inactive" | "All";
