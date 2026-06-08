"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import SelectInput from "../../common/SelectInput";
import type { Class, FeeRecord } from "./types";
import {
  schoolAdminStudentDetailsFeesUrl,
  warmSchoolAdminStudentDetails,
} from "./studentDetailsNav";
import InlinePagination from "../schooladmincomponents/InlinePagination";
import {
  appendDayReportSheet,
  drawFeeDayReportPdf,
  formatDdMmYyyyFromYmdInput,
  formatStudentClassForReport,
} from "@/lib/feeDayReportExcel";
import { formatRupee, roundRupee } from "@/lib/formatRupee";

const PAGE_SIZE = 20;

interface FeeRecordsTableProps {
  fees: FeeRecord[];
  classes: Class[];
}

type ReportPeriod = "DAY_WISE" | "MONTH_WISE" | "YEAR_WISE" | "ACADEMIC_YEAR_WISE";
type ExportFormat = "xlsx" | "csv" | "pdf";

export default function FeeRecordsTable({ fees, classes }: FeeRecordsTableProps) {
  const router = useRouter();
  const [searchName, setSearchName] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("DAY_WISE");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [academicYear, setAcademicYear] = useState(() => {
    const now = new Date();
    const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}-${start + 1}`;
  });
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [feeDueExporting, setFeeDueExporting] = useState(false);
  const [page, setPage] = useState(1);

  const filteredFees = fees.filter((f) => {
    const name = (f.student.user?.name || "").toLowerCase();
    const q = searchName.toLowerCase();
    if (q && !name.includes(q)) return false;
    if (selectedClass && f.student.class?.id !== selectedClass) return false;
    return true;
  });

  useEffect(() => {
    setPage(1);
  }, [searchName, selectedClass]);

  const totalPages = Math.max(1, Math.ceil(filteredFees.length / PAGE_SIZE));
  const paginatedFees = useMemo(
    () => filteredFees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredFees, page]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const classLabelById = new Map(
    classes.map((c) => [c.id, `${c.name}${c.section ? `-${c.section}` : ""}`])
  );

  const toSheetRows = (rows: FeeRecord[]) =>
    rows.map((f) => {
      const classLabel = f.student.class
        ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
        : "-";
      const status = f.remainingFee <= 0 ? "Paid" : "Pending";
      const discountAmount = roundRupee(Math.max((f.totalFee || 0) - (f.finalFee || 0), 0));
      return {
        "Student Name": f.student.user?.name || "-",
        "Admission Email": f.student.user?.email || "-",
        Class: classLabel,
        "Fee Type": f.feeTypes
          ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${formatRupee(f.feeTypeDueAmount)})` : ""}`
          : "-",
        "Total Fee": roundRupee(f.totalFee),
        "Discount %": roundRupee(f.discountPercent),
        "Discount Amount": discountAmount,
        "Final Fee": roundRupee(f.finalFee),
        Paid: roundRupee(f.amountPaid),
        Pending: roundRupee(f.remainingFee),
        Status: status,
      };
    });

  const downloadExcel = (filename: string, rows: FeeRecord[]) => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(toSheetRows(rows));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fee Records");
    XLSX.writeFile(workbook, filename);
  };

  const downloadCsv = (filename: string, rows: Record<string, string | number>[]) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escapeCsvValue = (value: string | number | undefined) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadImageAsDataUrl = async (url: string) => {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string) || null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const drawPrettyPdf = async ({
    filename,
    title,
    subtitle,
    rows,
    schoolName,
    schoolAddress,
    logoUrl,
  }: {
    filename: string;
    title: string;
    subtitle?: string;
    rows: Record<string, string | number>[];
    schoolName?: string;
    schoolAddress?: string;
    logoUrl?: string | null;
  }) => {
    if (!rows.length) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const printableWidth = pageWidth - margin * 2;
    const headerLabels: Record<string, string> = {
      Date: "DATE",
      "Student Name": "STUDENT NAME",
      "Admission No": "ADMISSION NO",
      Class: "CLASS",
      "Fee Head": "FEE HEAD",
      "Payment Method": "PAYMENT MODE",
      "UTR / Ref": "UTR / REF",
      Amount: "AMOUNT (INR)",
      "Admission Email": "EMAIL",
      "Fee Type": "FEE TYPE",
      "Total Fee": "TOTAL FEE",
      "Discount %": "DISCOUNT %",
      "Discount Amount": "DISCOUNT AMOUNT",
      "Final Fee": "FINAL FEE",
      Paid: "PAID",
      Pending: "PENDING",
      Status: "STATUS",
    };
    const rightAlignHeaders = new Set(["Amount", "Total Fee", "Discount Amount", "Final Fee", "Paid", "Pending"]);
    const headers = Object.keys(rows[0]);
    const preferredWidthMap: Record<string, number> = {
      Date: 22,
      "Student Name": 42,
      "Admission No": 26,
      Class: 20,
      "Fee Head": 50,
      "Fee Type": 48,
      "Payment Method": 24,
      "UTR / Ref": 28,
      Amount: 22,
      "Admission Email": 40,
      "Total Fee": 22,
      "Discount %": 20,
      "Discount Amount": 30,
      "Final Fee": 22,
      Paid: 18,
      Pending: 22,
      Status: 18,
    };

    const baseWidths = headers.map((header) => {
      const label = headerLabels[header] || header.toUpperCase();
      const labelWidth = doc.getTextWidth(label) + 7;
      return Math.max(preferredWidthMap[header] || 18, labelWidth);
    });
    const widthTotal = baseWidths.reduce((sum, width) => sum + width, 0);
    const columnWidths = [...baseWidths];
    if (widthTotal < printableWidth) {
      const remaining = printableWidth - widthTotal;
      const growHeaders = ["Student Name", "Fee Head", "Fee Type"];
      const presentGrowHeaders = growHeaders.filter((header) => headers.includes(header));
      const growBy = presentGrowHeaders.length > 0 ? remaining / presentGrowHeaders.length : 0;
      presentGrowHeaders.forEach((header) => {
        const idx = headers.indexOf(header);
        if (idx >= 0) columnWidths[idx] += growBy;
      });
    } else if (widthTotal > printableWidth) {
      const scale = printableWidth / widthTotal;
      headers.forEach((_, idx) => {
        columnWidths[idx] = columnWidths[idx] * scale;
      });
    }
    const rowHeight = 7;

    const logoData = logoUrl ? await loadImageAsDataUrl(logoUrl) : null;

    const logoFormat = logoData?.startsWith("data:image/jpeg")
      ? "JPEG"
      : logoData?.startsWith("data:image/webp")
        ? "WEBP"
        : "PNG";

    const paintWhitePage = () => {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      doc.setTextColor(0, 0, 0);
    };
    paintWhitePage();

    const drawPageFrame = (isFirstPage: boolean) => {
      if (isFirstPage) {
        const schoolAddressText = (schoolAddress || "Address not available").replace(/\s+/g, " ").trim();
        const logoSize = 18;
        const headerTop = 6;
        if (logoData) {
          try {
            doc.addImage(logoData, logoFormat, margin, headerTop, logoSize, logoSize);
          } catch {
            // Ignore invalid image format gracefully.
          }
        }

        const maxAddressWidth = pageWidth - margin * 2 - (logoData ? logoSize + 8 : 0);
        const addressLines = (doc.splitTextToSize(
          schoolAddressText,
          Math.max(80, maxAddressWidth)
        ) as string[]) || ["Address not available"];
        const visibleAddressLines = addressLines.slice(0, 2);

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(schoolName || "School", pageWidth / 2, 12, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.text(visibleAddressLines, pageWidth / 2, 18, { align: "center" });
        const titleY = 18 + visibleAddressLines.length * 5 + 3;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(title, pageWidth / 2, titleY, { align: "center" });
        if (subtitle) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.text(subtitle, pageWidth / 2, titleY + 6, { align: "center" });
        }

        const bandBottom = titleY + (subtitle ? 10 : 6);
        doc.setDrawColor(180, 180, 180);
        doc.line(margin, bandBottom, pageWidth - margin, bandBottom);
      }

      const tableY = isFirstPage ? 44 : 10;
      doc.setFillColor(230, 236, 248);
      doc.rect(margin, tableY, printableWidth, 8.5, "F");
      doc.setDrawColor(196, 208, 229);
      doc.rect(margin, tableY, printableWidth, pageHeight - tableY - 12);

      let x = margin;
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      headers.forEach((header, idx) => {
        const label = headerLabels[header] || header.toUpperCase();
        const width = columnWidths[idx];
        if (rightAlignHeaders.has(header)) {
          doc.text(label, x + width - 2, tableY + 5.6, { align: "right" });
        } else {
          doc.text(label, x + 2, tableY + 5.6);
        }
        x += width;
      });
      return tableY + 12;
    };

    const fitTextToWidth = (text: string, maxWidth: number) => {
      if (!text) return "-";
      if (doc.getTextWidth(text) <= maxWidth) return text;
      const ellipsis = "...";
      let low = 0;
      let high = text.length;
      let best = "";
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = `${text.slice(0, mid)}${ellipsis}`;
        if (doc.getTextWidth(candidate) <= maxWidth) {
          best = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return best || ellipsis;
    };

    const fitCellText = (text: string, maxWidth: number) => {
      const normalized = text.replace(/\s+/g, " ").trim() || "-";
      const lines = doc.splitTextToSize(normalized, maxWidth) as string[];
      if (lines.length <= 1) return lines[0] || "-";
      return fitTextToWidth(normalized, maxWidth);
    };

    let y = drawPageFrame(true);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);

    rows.forEach((row, rowIndex) => {
      const studentNameIdx = headers.indexOf("Student Name");
      const studentCellWidth = studentNameIdx >= 0 ? columnWidths[studentNameIdx] : 0;
      const studentRawValue = studentNameIdx >= 0 ? row["Student Name"] : "-";
      const studentValue =
        typeof studentRawValue === "number"
          ? studentRawValue.toLocaleString("en-IN")
          : String(studentRawValue ?? "-").replace(/\s+/g, " ").trim();
      const studentLines =
        studentNameIdx >= 0
          ? ((doc.splitTextToSize(studentValue || "-", Math.max(10, studentCellWidth - 4)) as string[]) || ["-"])
          : ["-"];
      const lineHeight = 3.8;
      const dynamicRowHeight = Math.max(rowHeight, studentLines.length * lineHeight + 2.4);

      if (y + dynamicRowHeight > pageHeight - 14) {
        doc.addPage();
        paintWhitePage();
        y = drawPageFrame(false);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.2);
      }

      const rowTop = y - 5.4;
      if (rowIndex % 2 === 0) {
        doc.setFillColor(245, 248, 255);
        doc.rect(margin + 0.2, rowTop, printableWidth - 0.4, dynamicRowHeight, "F");
      }

      let x = margin;
      headers.forEach((header, idx) => {
        const rawValue = row[header];
        const displayValue =
          typeof rawValue === "number"
            ? roundRupee(rawValue).toLocaleString("en-IN")
            : String(rawValue ?? "-");
        const width = columnWidths[idx];

        doc.setTextColor(39, 51, 79);
        if (header === "Student Name") {
          const wrappedLines = (doc.splitTextToSize(
            displayValue.replace(/\s+/g, " ").trim() || "-",
            Math.max(10, width - 4)
          ) as string[]) || ["-"];
          wrappedLines.forEach((line, lineIdx) => {
            doc.text(line, x + 2, rowTop + 4.8 + lineIdx * lineHeight);
          });
        } else {
          const clipped = fitCellText(displayValue, Math.max(10, width - 4));
          if (rightAlignHeaders.has(header)) {
            doc.text(clipped, x + width - 2, y, { align: "right" });
          } else {
            doc.text(clipped, x + 2, y);
          }
        }
        x += width;
      });
      y += dynamicRowHeight;
    });

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth - margin, pageHeight - 5.2, {
      align: "right",
    });
    doc.save(filename);
  };

  const removeAdmissionEmailColumn = (rows: Record<string, string | number>[]) =>
    rows.map((row) => {
      const { "Admission Email": _omit, ...rest } = row;
      return rest;
    });

  const getReportPeriodLabel = (value: ReportPeriod) => {
    if (value === "DAY_WISE") return "Day Wise";
    if (value === "MONTH_WISE") return "Month Wise";
    if (value === "YEAR_WISE") return "Year Wise";
    return "Academic Year Wise";
  };

  const getReportPeriodValue = () => {
    if (reportPeriod === "DAY_WISE") return reportDate || "-";
    if (reportPeriod === "MONTH_WISE") return reportMonth || "-";
    if (reportPeriod === "YEAR_WISE") return reportYear || "-";
    return academicYear || "-";
  };

  const toDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  /** Parse `YYYY-MM-DD` as a local calendar date (avoids UTC off-by-one with `new Date("yyyy-mm-dd")`). */
  const parseYmdLocal = (ymd: string) => {
    const parts = ymd.split("-").map((v) => Number(v));
    const y = parts[0];
    const m = parts[1];
    const day = parts[2];
    if (!y || !m || !day) return new Date(NaN);
    return new Date(y, m - 1, day);
  };

  const inSelectedPeriod = (createdAt: string) => {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return false;
    if (reportPeriod === "DAY_WISE") {
      const picked = parseYmdLocal(reportDate);
      if (Number.isNaN(picked.getTime())) return false;
      return toDateOnly(d).getTime() === toDateOnly(picked).getTime();
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

  const getReportDateRange = (): { from: string; to: string } => {
    if (reportPeriod === "DAY_WISE") {
      return { from: reportDate, to: reportDate };
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

  const exportFinalTemplate = async () => {
    const { from: reportFrom, to: reportTo } = getReportDateRange();
    const txQs = new URLSearchParams({
      limit: "10000",
      forFeeReport: "1",
      from: reportFrom,
      to: reportTo,
    });
    const [txRes, schoolRes] = await Promise.all([
      fetch(`/api/fees/transactions?${txQs.toString()}`, { credentials: "include" }),
      fetch("/api/school/mine", { credentials: "include", cache: "no-store" }),
    ]);
    const txData = await txRes.json().catch(() => ({}));
    const schoolPayload = await schoolRes.json().catch(() => ({}));
    const school = schoolPayload?.school as
      | {
          name?: string;
          address?: string;
          location?: string;
          affiliationLine?: string;
          logoUrl?: string | null;
          admins?: Array<{ photoUrl?: string | null }>;
        }
      | null
      | undefined;
    const reportLogoUrl =
      (typeof school?.logoUrl === "string" && school.logoUrl.trim()) ||
      (Array.isArray(school?.admins) && typeof school.admins[0]?.photoUrl === "string"
        ? school.admins[0].photoUrl.trim()
        : "") ||
      null;

    const transactions: Array<{
      id: string;
      amount: number;
      gateway?: string;
      createdAt: string;
      feeTypeName?: string;
      transactionId?: string | null;
      hyperpgTxnId?: string | null;
      feeAllocations?: Array<{ name: string; amount: number }>;
      student?: {
        admissionNumber?: string | null;
        user?: { name?: string | null; email?: string | null } | null;
        class?: { id?: string | null; name?: string | null; section?: string | null } | null;
      } | null;
    }> = Array.isArray(txData?.transactions) ? txData.transactions : [];

    const filteredTx = transactions.filter((t) => {
      const classId = t.student?.class?.id || "";
      if (selectedClass && classId !== selectedClass) return false;
      return inSelectedPeriod(t.createdAt);
    });
    if (filteredTx.length === 0) {
      alert("No fee transactions found for the selected report period.");
      return;
    }

    const headerDateLabel =
      reportPeriod === "DAY_WISE" ? formatDdMmYyyyFromYmdInput(reportDate) : getReportPeriodValue();
    const dayReportTitle =
      reportPeriod === "DAY_WISE" ? "Day Report" : `${getReportPeriodLabel(reportPeriod)} — collections`;

    const fileDate = new Date().toISOString().slice(0, 10);
    const safePeriod = reportPeriod.toLowerCase();
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

  const exportAllClasses = async () => {
    if (fees.length === 0) {
      alert("No fee records available to export.");
      return;
    }
    const fileDate = new Date().toISOString().slice(0, 10);
    const baseName = `fee-records-all-classes-${fileDate}`;
    if (exportFormat === "xlsx") {
      downloadExcel(`${baseName}.xlsx`, fees);
      return;
    }
    const rows = toSheetRows(fees);
    if (exportFormat === "csv") {
      downloadCsv(`${baseName}.csv`, rows);
      return;
    }
    const schoolRes = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const schoolPayload = await schoolRes.json().catch(() => ({}));
    const school = schoolPayload?.school as
      | { name?: string; address?: string; location?: string; affiliationLine?: string; logoUrl?: string | null }
      | null
      | undefined;
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
    if (fees.length === 0) {
      alert("No fee records available for this report.");
      return;
    }
    setFeeDueExporting(true);
    try {
      const q = selectedClass ? `?classId=${encodeURIComponent(selectedClass)}` : "";
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
      a.download = `fee-due-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Failed to export fee due report.");
    } finally {
      setFeeDueExporting(false);
    }
  };

  const exportSelectedClass = async () => {
    if (!selectedClass) {
      alert("Please select a class for class-wise export.");
      return;
    }
    const rows = fees.filter((f) => f.student.class?.id === selectedClass);
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
    const school = schoolPayload?.school as
      | { name?: string; address?: string; location?: string; affiliationLine?: string; logoUrl?: string | null }
      | null
      | undefined;
    await drawPrettyPdf({
      filename: `${baseName}.pdf`,
      title: `Fee Records (${className})`,
      rows: removeAdmissionEmailColumn(reportRows),
      schoolName: school?.name || "School",
      schoolAddress: [school?.address, school?.location, school?.affiliationLine].filter(Boolean).join(", "),
      logoUrl: school?.logoUrl || null,
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold mb-4">
        {`Fee Records (${filteredFees.length}${
          filteredFees.length > PAGE_SIZE
            ? ` · rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredFees.length)}`
            : ""
        })`}
      </h3>
      <div className="mb-4 rounded-xl border border-white/10 bg-black/10 p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <SelectInput
            value={reportPeriod}
            onChange={(value) => setReportPeriod(value as ReportPeriod)}
            options={[
              { label: "Day Wise", value: "DAY_WISE" },
              { label: "Month Wise", value: "MONTH_WISE" },
              { label: "Year Wise", value: "YEAR_WISE" },
              { label: "Academic Year Wise", value: "ACADEMIC_YEAR_WISE" },
            ]}
          />
          {reportPeriod === "DAY_WISE" && (
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
            />
          )}
          {reportPeriod === "MONTH_WISE" && (
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
            />
          )}
          {reportPeriod === "YEAR_WISE" && (
            <input
              type="number"
              min={2000}
              max={2100}
              value={reportYear}
              onChange={(e) => setReportYear(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
              placeholder="e.g. 2026"
            />
          )}
          {reportPeriod === "ACADEMIC_YEAR_WISE" && (
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
              placeholder="e.g. 2025-2026"
            />
          )}
          <SelectInput
            value={exportFormat}
            onChange={(value) => setExportFormat(value as ExportFormat)}
            options={[
              { label: "Export as Excel (.xlsx)", value: "xlsx" },
              { label: "Export as CSV (.csv)", value: "csv" },
              { label: "Export as PDF (.pdf)", value: "pdf" },
            ]}
          />
          <button
            type="button"
            onClick={() => void exportFinalTemplate()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/20"
          >
            <Download size={16} />
            Export Fee Report
          </button>
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Name or ID..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/20 border border-white/10 text-white"
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[220px]">
          <SelectInput
            value={selectedClass}
            onChange={setSelectedClass}
            options={[
              { label: "All Classes", value: "" },
              ...classes.map((c) => ({
                label: `${c.name}${c.section ? `-${c.section}` : ""}`,
                value: c.id,
              })),
            ]}
          />
        </div>
        <button
          type="button"
          onClick={() => void exportFeeDueReport()}
          disabled={feeDueExporting}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
        >
          <Download size={16} />
          {feeDueExporting ? "Exporting…" : "Fee Due Report (Excel)"}
        </button>
        <button
          type="button"
          onClick={exportAllClasses}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-2 text-sm text-lime-300 hover:bg-lime-500/20"
        >
          <Download size={16} />
          Export All Classes
        </button>
        <button
          type="button"
          onClick={exportSelectedClass}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/20"
        >
          <Download size={16} />
          Export Class-wise
        </button>
      </div>
      <div className="space-y-3 sm:hidden">
        {filteredFees.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-gray-400">
            No fee records found.
          </div>
        ) : (
          paginatedFees.map((f) => (
            <div key={f.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
              <button
                type="button"
                className="text-left text-base font-semibold text-white underline-offset-2 hover:underline"
                onMouseEnter={() => {
                  warmSchoolAdminStudentDetails(f.student.id);
                  router.prefetch(schoolAdminStudentDetailsFeesUrl(f.student.id));
                }}
                onClick={() => router.push(schoolAdminStudentDetailsFeesUrl(f.student.id))}
              >
                {f.student.user?.name || "-"}
              </button>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Class</span>
                  <span className="text-right text-white">
                    {f.student.class
                      ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
                      : "-"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-gray-400">Fee Type</span>
                  <span className="text-right text-gray-300">
                    {f.feeTypes
                      ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${formatRupee(f.feeTypeDueAmount)})` : ""}`
                      : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Total</span>
                  <span className="text-white">₹{formatRupee(f.finalFee)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Discount</span>
                  <span className="text-cyan-300">
                    {roundRupee(f.discountPercent)}% (₹
                    {formatRupee(Math.max((f.totalFee || 0) - (f.finalFee || 0), 0))})
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Paid</span>
                  <span className="text-emerald-400">₹{formatRupee(f.amountPaid)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Pending</span>
                  <span className="text-amber-400">₹{formatRupee(f.remainingFee)}</span>
                </div>
                <div className="pt-1">
                  <span
                    className={`inline-flex rounded px-2 py-1 text-xs ${
                      f.remainingFee <= 0
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {f.remainingFee <= 0 ? "Paid" : "Pending"}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="-mx-4 hidden overflow-x-auto px-4 sm:block sm:mx-0 sm:px-0">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-white/10">
              <th className="py-3">Student</th>
              <th className="py-3">Class</th>
              <th className="py-3">Fee Type</th>
              <th className="py-3">Total</th>
              <th className="py-3">Discount</th>
              <th className="py-3">Paid</th>
              <th className="py-3">Pending</th>
              <th className="py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedFees.map((f) => (
              <tr key={f.id} className="border-b border-white/5">
                <td
                  className="py-3 cursor-pointer select-none underline-offset-2 hover:underline text-white/95"
                  title="Double-click to open student fee details"
                  onMouseEnter={() => {
                    warmSchoolAdminStudentDetails(f.student.id);
                    router.prefetch(schoolAdminStudentDetailsFeesUrl(f.student.id));
                  }}
                  onDoubleClick={() => router.push(schoolAdminStudentDetailsFeesUrl(f.student.id))}
                >
                  {f.student.user?.name || "-"}
                </td>
                <td className="py-3">
                  {f.student.class
                    ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
                    : "-"}
                </td>
                <td className="py-3 text-gray-300">
                  {f.feeTypes
                    ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${formatRupee(f.feeTypeDueAmount)})` : ""}`
                    : "-"}
                </td>
                <td className="py-3">₹{formatRupee(f.finalFee)}</td>
                <td className="py-3 text-cyan-300">
                  {roundRupee(f.discountPercent)}% (₹
                  {formatRupee(Math.max((f.totalFee || 0) - (f.finalFee || 0), 0))})
                </td>
                <td className="py-3 text-emerald-400">₹{formatRupee(f.amountPaid)}</td>
                <td className="py-3 text-amber-400">₹{formatRupee(f.remainingFee)}</td>
                <td className="py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      f.remainingFee <= 0
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {f.remainingFee <= 0 ? "Paid" : "Pending"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <InlinePagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </section>
  );
}
