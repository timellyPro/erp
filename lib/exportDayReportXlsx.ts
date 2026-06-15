import * as XLSX from "xlsx";
import {
  appendDayReportSheet,
  formatDdMmYyyyFromYmdInput,
  type DayReportSchool,
  type DayReportTx,
} from "@/lib/feeDayReportExcel";

/** Download day-wise fee report Excel for one calendar date. */
export async function exportDayReportXlsx(dateYmd: string): Promise<boolean> {
  const qs = new URLSearchParams({
    limit: "10000",
    forFeeReport: "1",
    from: dateYmd,
    to: dateYmd,
  });

  const [txRes, schoolRes] = await Promise.all([
    fetch(`/api/fees/transactions?${qs.toString()}`, { credentials: "include" }),
    fetch("/api/school/mine", { credentials: "include", cache: "no-store" }),
  ]);

  const txData = await txRes.json().catch(() => ({}));
  const schoolPayload = await schoolRes.json().catch(() => ({}));

  if (!txRes.ok) {
    throw new Error((txData as { message?: string })?.message || "Failed to load transactions");
  }

  const transactions: DayReportTx[] = Array.isArray(txData?.transactions) ? txData.transactions : [];
  if (transactions.length === 0) {
    return false;
  }

  const school = (schoolPayload?.school ?? null) as DayReportSchool | null;
  const headerDateLabel = formatDdMmYyyyFromYmdInput(dateYmd);
  const workbook = XLSX.utils.book_new();
  appendDayReportSheet(workbook, "Day Report", school, "Day Report", headerDateLabel, transactions);
  XLSX.writeFile(workbook, `fee-report-day_wise-${dateYmd}.xlsx`);
  return true;
}
