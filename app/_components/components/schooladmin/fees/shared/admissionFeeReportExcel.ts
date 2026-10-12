import * as XLSX from "xlsx";
import type { Bucket, GroupMode, ReportPayload } from "./admissionFeeReportTypes";

export function exportAdmissionFeeReportExcel(
  data: ReportPayload,
  groupMode: GroupMode,
  buckets: Bucket[]
) {
  const channelTotals = data.totalsByChannel;
  const wb = XLSX.utils.book_new();

  const overviewRows: Array<Record<string, string | number>> = [
    { Metric: "Applications (paid)", Value: data.totals.count },
    { Metric: "Total collected (₹)", Value: Math.round(data.totals.amount * 100) / 100 },
  ];
  if (channelTotals?.cash) {
    overviewRows.push({
      Metric: "Cash collected (₹)",
      Value: Math.round(channelTotals.cash.amount * 100) / 100,
    });
    overviewRows.push({ Metric: "Cash applications", Value: channelTotals.cash.count });
  }
  if (channelTotals?.online) {
    overviewRows.push({
      Metric: "Online collected (₹)",
      Value: Math.round(channelTotals.online.amount * 100) / 100,
    });
    overviewRows.push({ Metric: "Online applications", Value: channelTotals.online.count });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), "Overview");

  const summaryRows = buckets.map((b) => ({
    Period: groupMode === "day" ? b.period : `${b.period}-01`,
    "Applications (count)": b.count,
    "Amount (₹)": Math.round(b.amount * 100) / 100,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), groupMode === "day" ? "By day" : "By month");

  const detailRows = data.applications.map((a) => ({
    "Application No": a.applicationNo,
    "Applicant Name": a.applicantName,
    "Class / grade": a.classOrGrade,
    "Admission fee (₹)": a.admissionFee,
    "Paid on (local)": new Date(a.paidAtIso).toLocaleString("en-IN"),
    Mode: a.paymentMode ?? "—",
    Method: a.paymentMethod ?? "—",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Applications");
  XLSX.writeFile(wb, `admission-fee-report-${data.from}_to_${data.to}.xlsx`);
}
