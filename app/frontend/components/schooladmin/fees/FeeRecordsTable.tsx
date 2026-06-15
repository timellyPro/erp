"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search, UserRound, X } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import SelectInput from "../../common/SelectInput";
import SearchInput from "../../common/SearchInput";
import type { Class, FeeRecord } from "./types";
import {
  schoolAdminStudentDetailsFeesUrl,
  warmSchoolAdminStudentDetails,
} from "./studentDetailsNav";
import InlinePagination from "../schooladmincomponents/InlinePagination";
import {
  appendDayReportSheet,
  buildDayReportSummaryModel,
  drawFeeDayReportPdf,
  formatDdMmYyyyFromYmdInput,
  formatStudentClassForReport,
  type CollectorSummaryRow,
  type DayReportTx,
} from "@/lib/feeDayReportExcel";
import { formatRupee, roundRupee } from "@/lib/formatRupee";
import { todayYmdLocal } from "@/lib/schoolDashboardCollection";

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
  const [reportDate, setReportDate] = useState(() => todayYmdLocal());
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [academicYear, setAcademicYear] = useState(() => {
    const now = new Date();
    const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}-${start + 1}`;
  });
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [feeDueExporting, setFeeDueExporting] = useState(false);
  const [collectorSummary, setCollectorSummary] = useState<CollectorSummaryRow[]>([]);
  const [collectorSummaryLoading, setCollectorSummaryLoading] = useState(false);
  const [reportCollectorUserId, setReportCollectorUserId] = useState("");
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [staffSearchOpen, setStaffSearchOpen] = useState(false);
  const [staffSummarySearch, setStaffSummarySearch] = useState("");
  const [collectorOptions, setCollectorOptions] = useState<Array<{ label: string; value: string }>>([
    { label: "All staff", value: "" },
  ]);
  const staffSearchRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/fees/collectors", { credentials: "include", signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const rows = Array.isArray(data?.collectors) ? data.collectors : [];
        setCollectorOptions([
          { label: "All staff", value: "" },
          ...rows.map((c: { userId: string; name: string }) => ({
            label: c.name,
            value: c.userId,
          })),
        ]);
      })
      .catch(() => {
        /* ignore */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!staffSearchRef.current?.contains(e.target as Node)) {
        setStaffSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const staffCollectors = useMemo(
    () => collectorOptions.filter((o) => o.value !== ""),
    [collectorOptions]
  );

  const selectedStaffLabel = useMemo(
    () => collectorOptions.find((o) => o.value === reportCollectorUserId)?.label ?? "",
    [collectorOptions, reportCollectorUserId]
  );

  const filteredStaffForSearch = useMemo(() => {
    const q = staffSearchQuery.trim().toLowerCase();
    if (!q) return staffCollectors.slice(0, 10);
    return staffCollectors.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 12);
  }, [staffCollectors, staffSearchQuery]);

  const clearStaffFilter = () => {
    setReportCollectorUserId("");
    setStaffSearchQuery("");
    setStaffSearchOpen(false);
  };

  const selectStaffCollector = (userId: string, label: string) => {
    setReportCollectorUserId(userId);
    setStaffSearchQuery(label);
    setStaffSearchOpen(false);
  };

  const displayedCollectorSummary = useMemo(() => {
    let rows = collectorSummary;
    if (reportCollectorUserId) {
      const selected = collectorOptions.find((o) => o.value === reportCollectorUserId);
      if (selected?.label) {
        rows = rows.filter((row) => row.name === selected.label);
      }
    }
    const q = staffSummarySearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) => row.name.toLowerCase().includes(q));
    }
    return rows;
  }, [collectorSummary, reportCollectorUserId, collectorOptions, staffSummarySearch]);

  const collectorSummaryTotal = useMemo(
    () => roundRupee(displayedCollectorSummary.reduce((s, r) => s + r.totalCollected, 0)),
    [displayedCollectorSummary]
  );

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

  const buildReportTxQueryParams = () => {
    const { from, to } = getReportDateRange();
    const txQs = new URLSearchParams({
      limit: "10000",
      forFeeReport: "1",
      from,
      to,
    });
    if (reportCollectorUserId) {
      txQs.set("collectedByUserId", reportCollectorUserId);
    }
    return txQs;
  };

  const filterReportTransactions = (transactions: DayReportTx[]): DayReportTx[] =>
    transactions.filter((t) => {
      const classId = t.student?.class?.id || "";
      if (selectedClass && classId !== selectedClass) return false;
      return inSelectedPeriod(t.createdAt);
    });

  const loadStaffCollectionSummary = async () => {
    setCollectorSummaryLoading(true);
    try {
      const res = await fetch(`/api/fees/transactions?${buildReportTxQueryParams().toString()}`, {
        credentials: "include",
      });
      const txData = await res.json().catch(() => ({}));
      const transactions: DayReportTx[] = Array.isArray(txData?.transactions) ? txData.transactions : [];
      const filteredTx = filterReportTransactions(transactions);
      setCollectorSummary(buildDayReportSummaryModel(filteredTx).collectorSummary);
    } catch (e) {
      console.error(e);
      setCollectorSummary([]);
    } finally {
      setCollectorSummaryLoading(false);
    }
  };

  const exportFinalTemplate = async () => {
    const { from: reportFrom, to: reportTo } = getReportDateRange();
    const txQs = buildReportTxQueryParams();
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

    const transactions: DayReportTx[] = Array.isArray(txData?.transactions) ? txData.transactions : [];

    const filteredTx = filterReportTransactions(transactions);
    if (filteredTx.length === 0) {
      alert("No fee transactions found for the selected report period.");
      return;
    }

    setCollectorSummary(buildDayReportSummaryModel(filteredTx).collectorSummary);

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
      <div className="mb-4 rounded-xl border border-white/10 bg-black/10 p-3 sm:p-4">
        <div className="mb-4 flex flex-col gap-1 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Fee collection report</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Pick a period, filter by staff, then export or view collections.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SelectInput
            label="Report period"
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400">Date</label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white"
              />
            </div>
          )}
          {reportPeriod === "MONTH_WISE" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400">Month</label>
              <input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white"
              />
            </div>
          )}
          {reportPeriod === "YEAR_WISE" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400">Year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={reportYear}
                onChange={(e) => setReportYear(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white"
                placeholder="e.g. 2026"
              />
            </div>
          )}
          {reportPeriod === "ACADEMIC_YEAR_WISE" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400">Academic year</label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white"
                placeholder="e.g. 2025-2026"
              />
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3 sm:p-4">
          <div className="mb-2 flex items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200/90">
              Staff collector filter
            </p>
          </div>

          {reportCollectorUserId ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-50">
                <UserRound className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
                <span className="truncate">{selectedStaffLabel}</span>
                <button
                  type="button"
                  onClick={clearStaffFilter}
                  className="rounded-full p-0.5 text-cyan-200/80 hover:bg-cyan-400/20 hover:text-white"
                  aria-label="Clear staff filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
              <button
                type="button"
                onClick={clearStaffFilter}
                className="text-xs text-cyan-200/70 underline-offset-2 hover:text-cyan-100 hover:underline"
              >
                Show all staff
              </button>
            </div>
          ) : null}

          <div
            ref={staffSearchRef}
            className="relative"
            onFocusCapture={() => setStaffSearchOpen(true)}
          >
            <SearchInput
              label="Search staff by name"
              value={staffSearchQuery}
              onChange={(value) => {
                setStaffSearchQuery(value);
                setStaffSearchOpen(true);
                if (!value.trim()) setReportCollectorUserId("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setStaffSearchOpen(false);
              }}
              placeholder="Type staff name…"
              variant="glass"
              icon={Search}
              showSearchIcon
            />
            {staffSearchOpen && (staffSearchQuery.trim() || staffCollectors.length > 0) && (
              <ul
                className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/95 py-1 shadow-xl backdrop-blur-md"
                role="listbox"
              >
                {!staffSearchQuery.trim() && (
                  <li>
                    <button
                      type="button"
                      onClick={clearStaffFilter}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-300 transition-colors hover:bg-white/10"
                    >
                      All staff
                    </button>
                  </li>
                )}
                {filteredStaffForSearch.length === 0 ? (
                  <li className="px-3 py-2.5 text-sm text-gray-500">No staff found</li>
                ) : (
                  filteredStaffForSearch.map((c) => (
                    <li key={c.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={reportCollectorUserId === c.value}
                        onClick={() => selectStaffCollector(c.value, c.label)}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-cyan-500/15 ${
                          reportCollectorUserId === c.value
                            ? "bg-cyan-500/20 text-cyan-100"
                            : "text-white"
                        }`}
                      >
                        <UserRound className="h-4 w-4 shrink-0 text-cyan-400/80" aria-hidden />
                        <span className="truncate">{c.label}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          {staffCollectors.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">
              No staff collectors yet — record an offline payment while logged in.
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SelectInput
            label="Export format"
            value={exportFormat}
            onChange={(value) => setExportFormat(value as ExportFormat)}
            options={[
              { label: "Excel (.xlsx)", value: "xlsx" },
              { label: "CSV (.csv)", value: "csv" },
              { label: "PDF (.pdf)", value: "pdf" },
            ]}
          />
          <button
            type="button"
            onClick={() => void exportFinalTemplate()}
            className="inline-flex h-[42px] w-full items-center justify-center gap-2 self-end rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 sm:h-auto sm:min-h-[42px]"
          >
            <Download size={16} />
            Export Fee Report
          </button>
          <button
            type="button"
            onClick={() => void loadStaffCollectionSummary()}
            disabled={collectorSummaryLoading}
            className="inline-flex h-[42px] w-full items-center justify-center gap-2 self-end rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 sm:col-span-2 lg:col-span-1 sm:h-auto sm:min-h-[42px]"
          >
            {collectorSummaryLoading ? "Loading…" : "Staff collection summary"}
          </button>
        </div>

        {(collectorSummary.length > 0 || collectorSummaryLoading) && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 sm:p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Offline collections by staff</p>
                {reportCollectorUserId && selectedStaffLabel ? (
                  <p className="mt-0.5 text-xs text-cyan-200/80">Showing: {selectedStaffLabel}</p>
                ) : null}
              </div>
              <div className="w-full sm:max-w-xs">
                <SearchInput
                  label="Search in summary"
                  value={staffSummarySearch}
                  onChange={setStaffSummarySearch}
                  placeholder="Filter by name…"
                  variant="glass"
                  icon={Search}
                  showSearchIcon
                />
              </div>
            </div>

            {collectorSummaryLoading ? (
              <p className="py-6 text-center text-sm text-gray-400">Loading staff collections…</p>
            ) : displayedCollectorSummary.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                {staffSummarySearch.trim() ? "No staff match your search." : "No collections for this period."}
              </p>
            ) : (
              <>
                <div className="space-y-2 sm:hidden">
                  {displayedCollectorSummary.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/15">
                          <UserRound className="h-4 w-4 text-cyan-300" aria-hidden />
                        </div>
                        <span className="truncate text-sm font-medium text-white">{row.name}</span>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-emerald-400">
                        ₹{formatRupee(row.totalCollected)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3">
                    <span className="text-sm font-semibold text-emerald-100">Total</span>
                    <span className="text-sm font-bold text-emerald-300">₹{formatRupee(collectorSummaryTotal)}</span>
                  </div>
                </div>

                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[280px] text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-gray-400">
                        <th className="pb-2 pr-4 font-medium">Staff name</th>
                        <th className="pb-2 font-medium text-right">Amount collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedCollectorSummary.map((row) => (
                        <tr key={row.name} className="border-b border-white/5 last:border-0">
                          <td className="py-2.5 pr-4 text-white">{row.name}</td>
                          <td className="py-2.5 text-right font-medium text-emerald-400">
                            ₹{formatRupee(row.totalCollected)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-white/10">
                        <td className="pt-2.5 pr-4 font-semibold text-white">Total</td>
                        <td className="pt-2.5 text-right font-bold text-emerald-300">
                          ₹{formatRupee(collectorSummaryTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
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
