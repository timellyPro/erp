"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import type { FeeRecord } from "../types";
import { isInactiveStudentStatus } from "@/lib/students/resolveStudentDisplayClass";
import {
  appendDayReportSheet,
  drawFeeDayReportPdf,
  formatStudentClassForReport,
  type DayReportTx,
} from "@/lib/fees/feeDayReportExcel";
import { roundRupee } from "@/lib/formatRupee";
import { downloadCsv, downloadExcel, removeAdmissionEmailColumn, toSheetRows } from "./feeRecordsSheetHelpers";
import { drawPrettyPdf } from "./feeRecordsPdfExport";
import {
  buildReportTxQueryParams,
  filterReportTransactions,
  formatDateRangeLabel,
  getReportDateRange,
  getReportPeriodLabel,
  getReportPeriodValue,
  type ReportPeriodState,
} from "./feeRecordsReportPeriod";
import type { ExportFormat } from "./feeRecordsTableTypes";

type SchoolInfo = {
  name?: string;
  address?: string;
  location?: string;
  affiliationLine?: string;
  logoUrl?: string | null;
  admins?: Array<{ photoUrl?: string | null }>;
};

export default function useFeeRecordsExportActions({
  periodState,
  exportFormat,
  selectedClass,
  selectedHead,
  studentStatusFilter,
  statusFilteredFees,
  classLabelById,
}: {
  periodState: ReportPeriodState;
  exportFormat: ExportFormat;
  selectedClass: string;
  selectedHead: string;
  studentStatusFilter: string;
  statusFilteredFees: FeeRecord[];
  classLabelById: Map<string, string>;
}) {
  const [feeDueExporting, setFeeDueExporting] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  /**
   * Fee-record exports used to read the page's in-memory list, which can be up to 30 minutes
   * old (client cache) and differ from the freshly fetched transactions report. Re-read the
   * records from the server, bypassing its cache, then apply the same status filter.
   */
  const loadFreshStatusFilteredFees = async (): Promise<FeeRecord[] | null> => {
    const all: FeeRecord[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const qs = new URLSearchParams({ take: "5000", refresh: "1" });
      if (cursor) qs.set("cursor", cursor);
      const res = await fetch(`/api/fees/records?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        fees?: FeeRecord[];
        nextCursor?: string | null;
        message?: string;
      };
      if (!res.ok) {
        alert(data.message || "Could not load the latest fee records. Please try again.");
        return null;
      }
      all.push(...(Array.isArray(data.fees) ? data.fees : []));
      cursor = data.nextCursor ?? null;
      if (!cursor) break;
    }
    if (cursor) {
      // Never export a partial list as if it were the whole school.
      alert("There are too many fee records to export at once. Filter by class and try again.");
      return null;
    }
    return all.filter((f) => {
      const inactive = isInactiveStudentStatus(f.student.status);
      if (studentStatusFilter === "Active") return !inactive;
      if (studentStatusFilter === "Inactive") return inactive;
      return true;
    });
  };

  /** One export at a time: blocks double-clicks and exporting while data is still loading. */
  const guarded = <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      if (exportBusy || feeDueExporting) return;
      setExportBusy(true);
      try {
        await fn(...args);
      } catch (e) {
        console.error(e);
        alert("Export failed. Please try again.");
      } finally {
        setExportBusy(false);
      }
    };

  const exportFinalTemplateImpl = async () => {
    if (periodState.reportPeriod === "DAY_WISE") {
      if (!periodState.reportDateFrom || !periodState.reportDateTo) {
        alert("Please select both From date and To date.");
        return;
      }
    }

    const txQs = buildReportTxQueryParams(periodState);
    const [txRes, schoolRes] = await Promise.all([
      fetch(`/api/fees/transactions?${txQs.toString()}`, { credentials: "include", cache: "no-store" }),
      fetch("/api/school/mine", { credentials: "include", cache: "no-store" }),
    ]);
    const txData = await txRes.json().catch(() => ({}));
    const schoolPayload = await schoolRes.json().catch(() => ({}));
    const school = schoolPayload?.school as SchoolInfo | null | undefined;
    const reportLogoUrl =
      (typeof school?.logoUrl === "string" && school.logoUrl.trim()) ||
      (Array.isArray(school?.admins) && typeof school.admins[0]?.photoUrl === "string"
        ? school.admins[0].photoUrl.trim()
        : "") ||
      null;

    const transactions: DayReportTx[] = Array.isArray(txData?.transactions) ? txData.transactions : [];

    const filteredTx = filterReportTransactions(transactions, periodState, selectedClass, selectedHead);
    if (filteredTx.length === 0) {
      alert("No fee transactions found for the selected report period.");
      return;
    }

    const { from: rangeFrom, to: rangeTo } = getReportDateRange(periodState);
    const headerDateLabel =
      periodState.reportPeriod === "DAY_WISE"
        ? formatDateRangeLabel(rangeFrom, rangeTo)
        : getReportPeriodValue(periodState);
    const dayReportTitle =
      periodState.reportPeriod === "DAY_WISE"
        ? rangeFrom === rangeTo
          ? "Day Report"
          : "Date Range Report"
        : `${getReportPeriodLabel(periodState.reportPeriod)} — collections`;

    const fileDate =
      periodState.reportPeriod === "DAY_WISE"
        ? rangeFrom === rangeTo
          ? rangeFrom
          : `${rangeFrom}_to_${rangeTo}`
        : new Date().toISOString().slice(0, 10);
    const safePeriod =
      periodState.reportPeriod === "DAY_WISE" ? "date_range" : periodState.reportPeriod.toLowerCase();
    const baseName = `fee-report-${safePeriod}-${fileDate}`;
    const rows = filteredTx.map((t) => ({
      Date: new Date(t.createdAt).toLocaleDateString("en-GB"),
      "Student Name": t.student?.user?.name || "-",
      "Admission No": t.student?.admissionNumber || "-",
      Class: formatStudentClassForReport(t.student?.class ?? null),
      "Fee Head":
        Array.isArray(t.feeAllocations) && t.feeAllocations.length
          ? t.feeAllocations.map((a) => a.name).join(", ")
          : t.feeTypeName || "-",
      "Payment Method": t.gateway || "-",
      "Collected By": t.collectedByName || "-",
      "UTR / Ref": t.transactionId || t.hyperpgTxnId || "-",
      Amount: roundRupee(t.amount ?? 0),
    }));

    if (exportFormat === "xlsx") {
      const workbook = XLSX.utils.book_new();
      appendDayReportSheet(workbook, "Day Report", school, dayReportTitle, headerDateLabel, filteredTx);
      XLSX.writeFile(workbook, `${baseName}.xlsx`);
      return;
    }

    if (exportFormat === "csv") {
      downloadCsv(`${baseName}.csv`, rows);
      return;
    }

    await drawFeeDayReportPdf({
      filename: `${baseName}.pdf`,
      school,
      reportTitle: dayReportTitle,
      headerDateLabel,
      transactions: filteredTx,
      logoUrl: reportLogoUrl,
    });
  };

  const exportAllClassesImpl = async () => {
    const statusFilteredFees = await loadFreshStatusFilteredFees();
    if (!statusFilteredFees) return;
    if (statusFilteredFees.length === 0) {
      alert("No fee records available to export.");
      return;
    }
    const fileDate = new Date().toISOString().slice(0, 10);
    const baseName = `fee-records-all-classes-${fileDate}`;
    if (exportFormat === "xlsx") {
      downloadExcel(`${baseName}.xlsx`, statusFilteredFees);
      return;
    }
    const rows = toSheetRows(statusFilteredFees);
    if (exportFormat === "csv") {
      downloadCsv(`${baseName}.csv`, rows);
      return;
    }
    const schoolRes = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const schoolPayload = await schoolRes.json().catch(() => ({}));
    const school = schoolPayload?.school as SchoolInfo | null | undefined;
    await drawPrettyPdf({
      filename: `${baseName}.pdf`,
      title: "Fee Records (All Classes)",
      rows: removeAdmissionEmailColumn(rows),
      schoolName: school?.name || "School",
      schoolAddress: [school?.address, school?.location, school?.affiliationLine].filter(Boolean).join(", "),
      logoUrl: school?.logoUrl || null,
    });
  };

  const exportFeeDueReport = async () => {
    if (statusFilteredFees.length === 0) {
      alert("No fee records available for this report.");
      return;
    }
    setFeeDueExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedClass) params.set("classId", selectedClass);
      if (selectedHead) params.set("head", selectedHead);
      if (studentStatusFilter !== "All") params.set("status", studentStatusFilter);
      const q = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/fees/export/fee-due-report${q}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        alert(data.message || "Failed to export fee due report.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const headSlug = selectedHead
        ? `-${selectedHead.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)}`
        : "";
      a.download = `fee-due-report${headSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Failed to export fee due report.");
    } finally {
      setFeeDueExporting(false);
    }
  };

  const exportSelectedClassImpl = async () => {
    if (!selectedClass) {
      alert("Please select a class for class-wise export.");
      return;
    }
    const statusFilteredFees = await loadFreshStatusFilteredFees();
    if (!statusFilteredFees) return;
    const rows = statusFilteredFees.filter((f) => f.student.class?.id === selectedClass);
    if (rows.length === 0) {
      alert("No fee records found for the selected class.");
      return;
    }
    const className = classLabelById.get(selectedClass) || "class";
    const safeClassName = className.replaceAll(/[^\w-]+/g, "_");
    const fileDate = new Date().toISOString().slice(0, 10);
    const baseName = `fee-records-${safeClassName}-${fileDate}`;
    if (exportFormat === "xlsx") {
      downloadExcel(`${baseName}.xlsx`, rows);
      return;
    }
    const reportRows = toSheetRows(rows);
    if (exportFormat === "csv") {
      downloadCsv(`${baseName}.csv`, reportRows);
      return;
    }
    const schoolRes = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const schoolPayload = await schoolRes.json().catch(() => ({}));
    const school = schoolPayload?.school as SchoolInfo | null | undefined;
    await drawPrettyPdf({
      filename: `${baseName}.pdf`,
      title: `Fee Records (${className})`,
      rows: removeAdmissionEmailColumn(reportRows),
      schoolName: school?.name || "School",
      schoolAddress: [school?.address, school?.location, school?.affiliationLine].filter(Boolean).join(", "),
      logoUrl: school?.logoUrl || null,
    });
  };

  const exportFinalTemplate = guarded(exportFinalTemplateImpl);
  const exportAllClasses = guarded(exportAllClassesImpl);
  const exportSelectedClass = guarded(exportSelectedClassImpl);

  return {
    feeDueExporting: feeDueExporting || exportBusy,
    exportFinalTemplate,
    exportAllClasses,
    exportFeeDueReport,
    exportSelectedClass,
  };
}
