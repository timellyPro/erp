import { formatDdMmYyyyFromYmdInput, type DayReportTx } from "@/lib/fees/feeDayReportExcel";
import {
  filterDayReportTransactions,
  isCreatedAtInDateRange,
  narrowDayReportTransactionToHead,
  orderedYmdRange,
} from "@/lib/fees/feeReportFilters";
import type { ReportPeriod } from "./feeRecordsTableTypes";

export const getReportPeriodLabel = (value: ReportPeriod) => {
  if (value === "DAY_WISE") return "Date Range";
  if (value === "MONTH_WISE") return "Month Wise";
  if (value === "YEAR_WISE") return "Year Wise";
  return "Academic Year Wise";
};

export const formatDateRangeLabel = (from: string, to: string) => {
  const fromLabel = formatDdMmYyyyFromYmdInput(from);
  const toLabel = formatDdMmYyyyFromYmdInput(to);
  if (!from && !to) return "-";
  if (from === to || !to) return fromLabel || from || "-";
  return `${fromLabel || from} – ${toLabel || to}`;
};

export const getReportPeriodValue = ({
  reportPeriod,
  reportDateFrom,
  reportDateTo,
  reportMonth,
  reportYear,
  academicYear,
}: {
  reportPeriod: ReportPeriod;
  reportDateFrom: string;
  reportDateTo: string;
  reportMonth: string;
  reportYear: string;
  academicYear: string;
}) => {
  if (reportPeriod === "DAY_WISE") return formatDateRangeLabel(reportDateFrom, reportDateTo);
  if (reportPeriod === "MONTH_WISE") return reportMonth || "-";
  if (reportPeriod === "YEAR_WISE") return reportYear || "-";
  return academicYear || "-";
};

export type ReportPeriodState = {
  reportPeriod: ReportPeriod;
  reportDateFrom: string;
  reportDateTo: string;
  reportMonth: string;
  reportYear: string;
  academicYear: string;
};

const inSelectedPeriod = (createdAt: string, state: ReportPeriodState) => {
  const { reportPeriod, reportDateFrom, reportDateTo, reportMonth, reportYear, academicYear } = state;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  if (reportPeriod === "DAY_WISE") {
    return isCreatedAtInDateRange(createdAt, reportDateFrom, reportDateTo);
  }
  if (reportPeriod === "MONTH_WISE") {
    const [y, m] = reportMonth.split("-").map((v) => Number(v));
    if (!y || !m) return false;
    return d.getFullYear() === y && d.getMonth() + 1 === m;
  }
  if (reportPeriod === "YEAR_WISE") {
    return d.getFullYear() === Number(reportYear);
  }
  const [start, end] = academicYear.split("-").map((v) => Number(v));
  if (!start || !end) return false;
  const startDate = new Date(start, 3, 1); // 1 Apr
  const endDate = new Date(end, 2, 31, 23, 59, 59, 999); // 31 Mar
  return d >= startDate && d <= endDate;
};

export const getReportDateRange = (state: ReportPeriodState): { from: string; to: string } => {
  const { reportPeriod, reportDateFrom, reportDateTo, reportMonth, reportYear, academicYear } = state;
  if (reportPeriod === "DAY_WISE") {
    return orderedYmdRange(reportDateFrom, reportDateTo);
  }
  if (reportPeriod === "MONTH_WISE") {
    const [y, m] = reportMonth.split("-").map((v) => Number(v));
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${reportMonth}-01`,
      to: `${reportMonth}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  if (reportPeriod === "YEAR_WISE") {
    return { from: `${reportYear}-01-01`, to: `${reportYear}-12-31` };
  }
  const [start, end] = academicYear.split("-").map((v) => Number(v));
  return { from: `${start}-04-01`, to: `${end}-03-31` };
};

export const buildReportTxQueryParams = (state: ReportPeriodState) => {
  const { from, to } = getReportDateRange(state);
  return new URLSearchParams({
    limit: "10000",
    forFeeReport: "1",
    from,
    to,
  });
};

export const filterReportTransactions = (
  transactions: DayReportTx[],
  state: ReportPeriodState,
  selectedClass: string,
  selectedHead: string
): DayReportTx[] => {
  if (state.reportPeriod === "DAY_WISE") {
    return filterDayReportTransactions(transactions, {
      fromYmd: state.reportDateFrom,
      toYmd: state.reportDateTo,
      classId: selectedClass || undefined,
      headName: selectedHead,
    });
  }
  return transactions.flatMap((transaction) => {
    const classId = transaction.student?.class?.id || "";
    if (selectedClass && classId !== selectedClass) return [];
    if (!inSelectedPeriod(transaction.createdAt, state)) return [];
    const narrowed = narrowDayReportTransactionToHead(transaction, selectedHead);
    return narrowed ? [narrowed] : [];
  });
};
