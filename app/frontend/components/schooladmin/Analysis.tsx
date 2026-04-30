"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  IndianRupee,
  Users,
  Star,
  Award,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  TrendingUp,
  BookOpen,
} from "lucide-react";

const TABLE_PAGE_SIZE = 5;

function TablePagination({
  page,
  totalPages,
  totalRows,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (p: number) => void;
}) {
  if (totalRows <= TABLE_PAGE_SIZE) return null;

  const from = (page - 1) * TABLE_PAGE_SIZE + 1;
  const to = Math.min(page * TABLE_PAGE_SIZE, totalRows);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-white/70">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 font-medium text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Previous
      </button>
      <span className="tabular-nums text-center text-white/60">
        Page {page} of {totalPages}
        <span className="text-white/40"> · </span>
        Showing {from}–{to} of {totalRows}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 font-medium text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------------- Types ---------------- */

type FeeCollectionRow = {
  classId: string;
  label: string;
  totalFees: number;
  avgDiscountPercent: number;
  finalFees: number;
  paidFee: number;
  pendingFee: number;
  collectionPercent: number;
  duePercent: number;
};

type EnrollmentByClassSectionRow = {
  classId: string;
  className: string;
  section: string | null;
  male: number;
  female: number;
  total: number;
};

type ExportFormat = "PDF" | "XLSX" | "CSV" | "JSON";

type AnalysisResponse = {
  availableYears: number[];
  classes?: { id: string; name: string; section: string | null }[];
  selectedYear: number;
  enrollmentByClassSection?: EnrollmentByClassSectionRow[];
  enrollmentByClassSectionTotals?: { male: number; female: number; total: number };
  feeCollectionByClass?: FeeCollectionRow[];
  feeCollectionTotals?: Omit<FeeCollectionRow, "classId">;
  stats: {
    feesCollected: number;
    totalEnrollment: number;
    avgTeacherRating: number;
    avgExamScore: number;
  };
  charts: {
    monthlyFeesCollection: { month: string; amount: number }[];
    enrollmentGrowth: { year: number; count: number }[];
    attendance: { students: number; teachers: number };
    subjectPerformance: { subject: string; percentage: number }[];
  };
  topTeachers: { id: string; name: string; subject: string; rating: number }[];
};

import Spinner from "../common/Spinner";
import PageHeader from "../common/PageHeader";
import SelectInput from "../common/SelectInput";
/* ---------------- Component ---------------- */

export default function AnalysisDashboard() {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // year is the start academic year; 0 indicates not yet loaded
  const [year, setYear] = useState<number>(0);
  const [classId, setClassId] = useState("");
  const [enrollmentPage, setEnrollmentPage] = useState(1);
  const [feePage, setFeePage] = useState(1);
  const [enrollmentExportFormat, setEnrollmentExportFormat] = useState<ExportFormat>("XLSX");
  const [feeExportFormat, setFeeExportFormat] = useState<ExportFormat>("XLSX");
  const [enrollmentSearch, setEnrollmentSearch] = useState("");
  const [enrollmentSectionFilter, setEnrollmentSectionFilter] = useState("");
  const [feeSearch, setFeeSearch] = useState("");
  const [feeClassSectionFilter, setFeeClassSectionFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (year !== 0) params.set("year", String(year));
    if (classId) params.set("classId", classId);

    fetch(`/api/school/analysis?${params}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((res: AnalysisResponse & { message?: string }) => {
        if (res.message && !res.stats) {
          setError(res.message ?? "Failed to load");
          setData(null);
          return;
        }
        setData(res as AnalysisResponse);
        // ensure year matches server suggestion
        if (year === 0 && res.selectedYear) {
          setYear(res.selectedYear);
        }
      })
      .catch(() => {
        setError("Failed to load analysis");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [year, classId]);

  useEffect(() => {
    setEnrollmentPage(1);
    setFeePage(1);
  }, [year, classId, enrollmentSearch, enrollmentSectionFilter, feeSearch, feeClassSectionFilter]);

  useEffect(() => {
    if (!data) return;
    const er = Array.isArray(data.enrollmentByClassSection) ? data.enrollmentByClassSection : [];
    const fr = Array.isArray(data.feeCollectionByClass) ? data.feeCollectionByClass : [];
    const ep = Math.max(1, Math.ceil(er.length / TABLE_PAGE_SIZE));
    const fp = Math.max(1, Math.ceil(fr.length / TABLE_PAGE_SIZE));
    setEnrollmentPage((p) => Math.min(Math.max(1, p), ep));
    setFeePage((p) => Math.min(Math.max(1, p), fp));
  }, [data]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 text-white">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 text-white">
        <p className="text-red-400">{error ?? "No data available"}</p>
      </div>
    );
  }

  /* ---------------- UI-ready Data ---------------- */

  const stats = [
    {
      title: "Fees Collected",
      value: data.stats.feesCollected >= 100000
        ? `₹${(data.stats.feesCollected / 100000).toFixed(1)}L`
        : `₹${data.stats.feesCollected.toLocaleString()}`,
      change: "vs last month",
      icon: IndianRupee,
      iconColor: "text-lime-400",
      iconBorder: "border-lime-400/30",
      iconBg: "bg-lime-400/10",
      changeColor: "text-lime-400",
    },
    {
      title: "Total Enrollment",
      value: data.stats.totalEnrollment.toLocaleString(),
      change: "New admissions",
      icon: Users,
      iconColor: "text-sky-400",
      iconBorder: "border-sky-400/30",
      iconBg: "bg-sky-400/10",
      changeColor: "text-sky-400",
    },
    {
      title: "Avg Teacher Rating",
      value:
        data.stats.avgTeacherRating > 0
          ? `${data.stats.avgTeacherRating} / 5`
          : "—",
      change: "Based on student feedback",
      icon: Star,
      iconColor: "text-purple-300",
      iconBorder: "border-purple-300/30",
      iconBg: "bg-purple-300/10",
      changeColor: "text-purple-300",
    },
    {
      title: "Avg Exam Score",
      value: `${data.stats.avgExamScore}%`,
      change: "vs last year",
      icon: Award,
      iconColor: "text-yellow-400",
      iconBorder: "border-yellow-400/30",
      iconBg: "bg-yellow-400/10",
      changeColor: "text-yellow-400",
    },
  ];
  const axisStyle = {
    stroke: "rgba(255,255,255,0.45)",
    fontSize: 11,
  };

  const feesData = (data.charts?.monthlyFeesCollection ?? []).map((f) => ({
    month: f.month,
    value: f.amount,
  }));

  const enrollmentData = (data.charts?.enrollmentGrowth ?? []).map((e) => ({
    year: e.year.toString(),
    students: e.count,
  }));

  const attendance = data.charts?.attendance ?? { students: 0, teachers: 0 };
  const attendanceData = [
    {
      day: "Avg",
      students: attendance.students,
      teachers: attendance.teachers,
    },
  ];

  const subjectData = (data.charts?.subjectPerformance ?? []).map((s) => ({
    subject: s.subject,
    score: s.percentage,
  }));

  // All teachers sorted best to least (API returns already sorted)
  const topTeachers = data.topTeachers ?? [];
  const feeRows = Array.isArray(data.feeCollectionByClass) ? data.feeCollectionByClass : [];
  const feeTotals = data.feeCollectionTotals;
  const enrollmentRows = Array.isArray(data.enrollmentByClassSection)
    ? data.enrollmentByClassSection
    : [];
  const enrollmentTotals = data.enrollmentByClassSectionTotals;

  const formatInr = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
  const exportFormatOptions = [
    { label: "Excel (.xlsx)", value: "XLSX" },
    { label: "CSV (.csv)", value: "CSV" },
    { label: "PDF (.pdf)", value: "PDF" },
    { label: "JSON (.json)", value: "JSON" },
  ];

  const getAcademicYearLabel = () => {
    const y = year !== 0 ? year : data.selectedYear;
    return `${y}-${y + 1}`;
  };

  const makeSafeFileName = (base: string, ext: string) =>
    `${base.replace(/[^\w-]+/g, "_").toLowerCase()}.${ext}`;

  const downloadJson = (filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportWithXlsx = async (
    rows: Array<Record<string, string | number>>,
    sheetName: string,
    filenameBase: string,
    format: ExportFormat
  ) => {
    if (rows.length === 0) {
      alert("No data available to export.");
      return;
    }
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    if (format === "CSV") {
      XLSX.writeFile(workbook, makeSafeFileName(filenameBase, "csv"), { bookType: "csv" });
      return;
    }
    XLSX.writeFile(workbook, makeSafeFileName(filenameBase, "xlsx"));
  };

  const exportAsPdfTable = async (
    schoolName: string,
    title: string,
    rows: Array<Record<string, string | number>>,
    filenameBase: string
  ) => {
    if (rows.length === 0) {
      alert("No data available to export.");
      return;
    }

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const keys = Object.keys(rows[0]);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 28;
    const tableTop = 130;
    const tableBottomMargin = 34;
    const rowHeight = 20;
    const colGap = 6;
    const availableWidth = pageWidth - marginX * 2;
    const columnWidth = (availableWidth - colGap * (keys.length - 1)) / keys.length;
    const maxCellChars = Math.max(8, Math.floor(columnWidth / 4.8));

    const drawHeader = () => {
      doc.setFillColor(163, 230, 53);
      doc.rect(0, 0, pageWidth, 82, "F");
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(marginX, 16, pageWidth - marginX * 2, 82, 12, 12, "F");

      doc.setFont("helvetica", "bold");
      doc.setTextColor(22, 25, 30);
      doc.setFontSize(17);
      doc.text((schoolName || "Timely School").toUpperCase(), marginX + 14, 43);
      doc.setFontSize(12);
      doc.text(title, marginX + 14, 63);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(70, 75, 82);
      doc.setFontSize(9);
      doc.text(`Academic Year: ${getAcademicYearLabel()}`, marginX + 14, 79);
      doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, pageWidth - marginX - 170, 79);

      doc.setFillColor(39, 44, 52);
      doc.roundedRect(marginX, tableTop - 24, availableWidth, 22, 8, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setTextColor(241, 245, 249);
      doc.setFontSize(8);
      keys.forEach((key, idx) => {
        const x = marginX + idx * (columnWidth + colGap) + 4;
        doc.text(key, x, tableTop - 10, { maxWidth: columnWidth - 8 });
      });
    };

    const drawRow = (row: Record<string, string | number>, y: number, zebra: boolean) => {
      doc.setFillColor(zebra ? 250 : 244, zebra ? 252 : 247, zebra ? 255 : 250);
      doc.roundedRect(marginX, y - 13, availableWidth, 16, 4, 4, "F");
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 35, 44);
      doc.setFontSize(8);
      keys.forEach((key, idx) => {
        const x = marginX + idx * (columnWidth + colGap) + 4;
        const raw = String(row[key] ?? "");
        const value = raw.length > maxCellChars ? `${raw.slice(0, maxCellChars - 1)}…` : raw;
        doc.text(value, x, y - 2, { maxWidth: columnWidth - 8 });
      });
    };

    let y = tableTop;
    drawHeader();

    rows.forEach((row, index) => {
      if (y + rowHeight > pageHeight - tableBottomMargin) {
        doc.addPage();
        y = tableTop;
        drawHeader();
      }
      drawRow(row, y, index % 2 === 0);
      y += rowHeight;
    });

    doc.save(makeSafeFileName(filenameBase, "pdf"));
  };
  const schoolName = "Timely School";
  const enrollmentSectionOptions = Array.from(
    new Set(
      enrollmentRows
        .map((row) => (row.section && row.section.trim() !== "" ? row.section.trim() : ""))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const feeClassSectionOptions = Array.from(new Set(feeRows.map((row) => row.label))).sort((a, b) =>
    a.localeCompare(b)
  );

  const enrollmentRowsFiltered = enrollmentRows.filter((row) => {
    const sectionLabel = row.section && row.section.trim() !== "" ? row.section.trim() : "";
    const search = enrollmentSearch.trim().toLowerCase();
    const matchesSearch =
      !search ||
      row.className.toLowerCase().includes(search) ||
      sectionLabel.toLowerCase().includes(search);
    const matchesSection = !enrollmentSectionFilter || sectionLabel === enrollmentSectionFilter;
    return matchesSearch && matchesSection;
  });

  const feeRowsFiltered = feeRows.filter((row) => {
    const search = feeSearch.trim().toLowerCase();
    const matchesSearch = !search || row.label.toLowerCase().includes(search);
    const matchesClassSection = !feeClassSectionFilter || row.label === feeClassSectionFilter;
    return matchesSearch && matchesClassSection;
  });

  const enrollmentFilteredTotals =
    enrollmentRowsFiltered.length > 0
      ? enrollmentRowsFiltered.reduce(
          (acc, row) => ({
            male: acc.male + row.male,
            female: acc.female + row.female,
            total: acc.total + row.total,
          }),
          { male: 0, female: 0, total: 0 }
        )
      : null;

  const feeFilteredTotals =
    feeRowsFiltered.length > 0
      ? feeRowsFiltered.reduce(
          (acc, row) => ({
            totalFees: acc.totalFees + row.totalFees,
            finalFees: acc.finalFees + row.finalFees,
            paidFee: acc.paidFee + row.paidFee,
            pendingFee: acc.pendingFee + row.pendingFee,
          }),
          { totalFees: 0, finalFees: 0, paidFee: 0, pendingFee: 0 }
        )
      : null;

  const feeFilteredAvgDiscountPercent =
    feeRowsFiltered.length > 0
      ? Number(
          (
            feeRowsFiltered.reduce((acc, row) => acc + row.avgDiscountPercent, 0) /
            feeRowsFiltered.length
          ).toFixed(2)
        )
      : 0;

  const feeFilteredCollectionPercent =
    feeFilteredTotals && feeFilteredTotals.finalFees > 0
      ? Number(((feeFilteredTotals.paidFee / feeFilteredTotals.finalFees) * 100).toFixed(2))
      : 0;

  const feeFilteredDuePercent =
    feeFilteredTotals && feeFilteredTotals.finalFees > 0
      ? Number(((feeFilteredTotals.pendingFee / feeFilteredTotals.finalFees) * 100).toFixed(2))
      : 0;

  const enrollmentExportRows = enrollmentRowsFiltered.map((row) => ({
    Class: row.className,
    Section: row.section && row.section.trim() !== "" ? row.section : "-",
    Male: row.male,
    Female: row.female,
    Total: row.total,
  }));

  const feeExportRows = feeRowsFiltered.map((row) => ({
    "Class / Section": row.label,
    "Total Fees": Number(row.totalFees.toFixed(2)),
    "Avg Discount %": Number(row.avgDiscountPercent.toFixed(2)),
    "Final Fees": Number(row.finalFees.toFixed(2)),
    Paid: Number(row.paidFee.toFixed(2)),
    Pending: Number(row.pendingFee.toFixed(2)),
    "Collection %": Number(row.collectionPercent.toFixed(2)),
    "Due %": Number(row.duePercent.toFixed(2)),
  }));

  const exportEnrollment = async () => {
    const filenameBase = `students_by_class_section_gender_${getAcademicYearLabel()}`;
    const payload = {
      academicYear: getAcademicYearLabel(),
      classFilter: classId || "ALL",
      rows: enrollmentExportRows,
      totals: enrollmentFilteredTotals,
    };

    try {
      if (enrollmentExportFormat === "JSON") {
        downloadJson(makeSafeFileName(filenameBase, "json"), payload);
        return;
      }
      if (enrollmentExportFormat === "PDF") {
        await exportAsPdfTable(
          schoolName,
          `Students by class & section (gender) · ${getAcademicYearLabel()}`,
          enrollmentExportRows,
          filenameBase
        );
        return;
      }
      await exportWithXlsx(
        enrollmentExportRows,
        "Students by Gender",
        filenameBase,
        enrollmentExportFormat
      );
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    }
  };

  const exportFeeCollection = async () => {
    const filenameBase = `fee_collection_class_section_${getAcademicYearLabel()}`;
    const payload = {
      academicYear: getAcademicYearLabel(),
      classFilter: classId || "ALL",
      rows: feeExportRows,
      totals: feeFilteredTotals
        ? {
            ...feeFilteredTotals,
            avgDiscountPercent: feeFilteredAvgDiscountPercent,
            collectionPercent: feeFilteredCollectionPercent,
            duePercent: feeFilteredDuePercent,
          }
        : null,
    };

    try {
      if (feeExportFormat === "JSON") {
        downloadJson(makeSafeFileName(filenameBase, "json"), payload);
        return;
      }
      if (feeExportFormat === "PDF") {
        await exportAsPdfTable(
          schoolName,
          `Fee collection (class & section) · ${getAcademicYearLabel()}`,
          feeExportRows,
          filenameBase
        );
        return;
      }
      await exportWithXlsx(
        feeExportRows,
        "Fee Collection",
        filenameBase,
        feeExportFormat
      );
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    }
  };

  const enrollmentTotalPages = Math.max(1, Math.ceil(enrollmentRowsFiltered.length / TABLE_PAGE_SIZE));
  const feeTotalPages = Math.max(1, Math.ceil(feeRowsFiltered.length / TABLE_PAGE_SIZE));
  const enrollmentPageEff = Math.min(Math.max(1, enrollmentPage), enrollmentTotalPages);
  const feePageEff = Math.min(Math.max(1, feePage), feeTotalPages);
  const enrollmentPaged = enrollmentRowsFiltered.slice(
    (enrollmentPageEff - 1) * TABLE_PAGE_SIZE,
    enrollmentPageEff * TABLE_PAGE_SIZE
  );
  const feePaged = feeRowsFiltered.slice((feePageEff - 1) * TABLE_PAGE_SIZE, feePageEff * TABLE_PAGE_SIZE);

  /* ---------------- UI ---------------- */

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 text-white">
      {/* Header */}
      <PageHeader
        title="Analysis & Reports"
        subtitle="Comprehensive insights into school performance"
        className="border"
        transparent={false}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2 self-center">
            <div className="relative">
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="
                  appearance-none
                  bg-black/40
                  text-white
                  px-4 py-2 pl-3 pr-8
                  rounded-xl
                  text-sm
                  border border-white/10
                  focus:outline-none
                  focus:ring-1 focus:ring-white/20
                  cursor-pointer
                  min-w-[120px]
                "
              >
                <option value="" className="text-black">All Classes</option>
                {(data.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id} className="text-black">
                    {c.name}{c.section ? ` ${c.section}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={
                  year !== 0
                    ? year
                    : data.availableYears && data.availableYears.length > 0
                    ? data.availableYears[0]
                    : ""
                }
                onChange={(e) => setYear(Number(e.target.value))}
                className="
                  appearance-none
                  bg-black/40
                  text-white
                  px-6 sm:px-7 py-2 pl-2
                  rounded-xl
                  text-sm
                  border border-white/10
                  focus:outline-none
                  focus:ring-1 focus:ring-white/20
                  cursor-pointer
                  text-center
                  min-w-[100px]
                "
              >
                {(data.availableYears ?? []).map((y) => (
                  <option key={y} value={y} className="text-black">
                    {y}-{y + 1}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
            </div>
          </div>
        }
      />

      {/* Stats - responsive grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="rounded-xl sm:rounded-2xl p-3 sm:p-5 bg-white/10 backdrop-blur-md border border-white/10 flex flex-col justify-between min-h-[100px] sm:min-h-0"
          >
            <div className="flex items-start gap-2 sm:gap-4">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center border shrink-0 ${stat.iconBorder} ${stat.iconBg}`}
              >
                <stat.icon
                  className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.iconColor}`}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-[10px] sm:text-xs text-white/70 leading-tight truncate">
                  {stat.title}
                </p>
                <h2
                  className={`text-lg sm:text-2xl font-bold truncate ${stat.changeColor}`}
                >
                  {stat.value}
                </h2>
              </div>
            </div>
            <p
              className={`text-[10px] sm:text-xs mt-2 sm:mt-3 ml-0 sm:ml-2 ${stat.changeColor} truncate`}
            >
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-white/10 backdrop-blur-md min-h-[280px] sm:min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-lime-400 shrink-0" />
            <h3 className="font-semibold text-white text-xs sm:text-sm">
              Monthly Fees Collection
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={feesData}>
              <defs>
                <linearGradient id="fees" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a3e635" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#a3e635" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
              />
              <YAxis {...axisStyle} tickLine={false} axisLine={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#a3e635"
                fill="url(#fees)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-white/10 backdrop-blur-md min-h-[280px] sm:min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
            <h3 className="font-semibold text-white text-xs sm:text-sm">
              Student Enrollment Growth
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={enrollmentData} barCategoryGap="35%">
              <XAxis
                dataKey="year"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
              />
              <YAxis {...axisStyle} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="students" fill="#60a5fa" barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-white/10 backdrop-blur-md min-h-[280px] sm:min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
            <h3 className="font-semibold text-white text-xs sm:text-sm">
              Attendance: Students vs Teachers
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={attendanceData}>
              <XAxis
                dataKey="day"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                {...axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip formatter={(value: any) => `${value}%`} />
              <Line
                type="monotone"
                dataKey="students"
                stroke="#60a5fa"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="teachers"
                stroke="#a3e635"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-white/10 backdrop-blur-md min-h-[280px] sm:min-h-[320px]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 bg-dark-400 shrink-0" />
              <h3 className="font-semibold text-white text-xs sm:text-sm">
                Subject Performance
              </h3>
            </div>
            <span className="text-[10px] sm:text-xs text-white/50 border border-white/10 rounded-lg px-2 py-1">
              All Exams
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={subjectData} layout="vertical">
              <XAxis
                type="number"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="subject"
                type="category"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip />
              <Bar dataKey="score" fill="#facc15" barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Performing Teachers - sorted best first */}
      <div className="mt-4 sm:mt-6 rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white/10 backdrop-blur-md border border-white/10">
        <div className="mb-4 sm:mb-5">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 sm:w-5 sm:h-5 text-purple-300 shrink-0" />
            <h3 className="font-semibold text-white text-sm sm:text-base">
              Top Performing Teachers
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-white/50 mt-1">
            By student exam performance ({data.selectedYear}-
            {data.selectedYear + 1}), best first
          </p>
        </div>

        <div className="border-t border-white/10 mb-4 sm:mb-5" />

        {topTeachers.length === 0 ? (
          <p className="text-sm text-white/50 py-4">
            No teacher performance data for this year yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {topTeachers.map((t) => (
              <div
                key={t.id}
                className="rounded-lg sm:rounded-xl p-4 sm:p-6 bg-white/5 border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full uppercase bg-purple-400/20 flex items-center justify-center text-purple-300 shrink-0 text-sm sm:text-base">
                    {t.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-semibold text-white truncate">
                      {t.name}
                    </p>
                    <p className="text-[10px] sm:text-xs text-white/30 truncate">
                      {t.subject}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lime-400 font-bold text-sm sm:text-base">
                    {t.rating.toFixed(1)}
                  </p>
                  <p className="text-[10px] text-white/40">Rating</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enrollment by gender: class & section */}
      <div className="mt-4 sm:mt-6 rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white/10 backdrop-blur-md border border-white/10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
              <h3 className="font-semibold text-white text-sm sm:text-base">
                Students by class & section (gender)
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-white/50 mt-1 pl-0 sm:pl-7">
              Male / female counts follow the gender saved on each student; other or blank genders
              are included in total only.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <input
              type="text"
              value={enrollmentSearch}
              onChange={(e) => setEnrollmentSearch(e.target.value)}
              placeholder="Search class / section"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-lime-400/40 sm:w-[180px] sm:text-sm"
            />
            <div className="w-full sm:w-[165px]">
              <SelectInput
                value={enrollmentSectionFilter}
                onChange={setEnrollmentSectionFilter}
                options={[
                  { label: "All Sections", value: "" },
                  ...enrollmentSectionOptions.map((s) => ({ label: s, value: s })),
                ]}
              />
            </div>
            <div className="w-full sm:w-[170px]">
              <SelectInput
                value={enrollmentExportFormat}
                onChange={(value) => setEnrollmentExportFormat(value as ExportFormat)}
                options={exportFormatOptions}
              />
            </div>
            <button
              type="button"
              onClick={() => void exportEnrollment()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/15 px-3 py-2 text-xs sm:text-sm font-semibold text-lime-200 hover:bg-lime-500/25 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 sm:mx-0">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <th className="py-3 pr-3 font-medium">Class</th>
                <th className="py-3 px-2 font-medium">Section</th>
                <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Male</th>
                <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Female</th>
                <th className="py-3 pl-2 text-right font-medium whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="text-white/90">
              {enrollmentRowsFiltered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-white/40">
                    No matching class / section found.
                  </td>
                </tr>
              ) : (
                enrollmentPaged.map((row) => (
                  <tr
                    key={row.classId}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="py-3 pr-3 font-semibold text-white">{row.className}</td>
                    <td className="py-3 px-2 text-gray-300">
                      {row.section && row.section.trim() !== "" ? row.section : "—"}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-sky-300">
                      {row.male.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-fuchsia-300/90">
                      {row.female.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 pl-2 text-right tabular-nums text-white font-medium">
                      {row.total.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))
              )}
              {enrollmentFilteredTotals && enrollmentRowsFiltered.length > 0 ? (
                <tr className="border-t border-white/20 bg-white/[0.06] font-semibold">
                  <td className="py-3 pr-3 text-white" colSpan={2}>
                    Filtered total
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-sky-300">
                    {enrollmentFilteredTotals.male.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-fuchsia-300">
                    {enrollmentFilteredTotals.female.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 pl-2 text-right tabular-nums text-white">
                    {enrollmentFilteredTotals.total.toLocaleString("en-IN")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={enrollmentPageEff}
          totalPages={enrollmentTotalPages}
          totalRows={enrollmentRowsFiltered.length}
          onPageChange={setEnrollmentPage}
        />
      </div>

      {/* Fee collection: class & section */}
      <div className="mt-4 sm:mt-6 rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white/10 backdrop-blur-md border border-white/10">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 sm:w-5 sm:h-5 text-lime-400 shrink-0" />
              <h3 className="font-semibold text-white text-sm sm:text-base">
                Fee collection (class & section)
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-white/50 mt-1 pl-0 sm:pl-7">
              From student fee records for each class / section.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <input
              type="text"
              value={feeSearch}
              onChange={(e) => setFeeSearch(e.target.value)}
              placeholder="Search class / section"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-lime-400/40 sm:w-[180px] sm:text-sm"
            />
            <div className="w-full sm:w-[180px]">
              <SelectInput
                value={feeClassSectionFilter}
                onChange={setFeeClassSectionFilter}
                options={[
                  { label: "All class / section", value: "" },
                  ...feeClassSectionOptions.map((label) => ({ label, value: label })),
                ]}
              />
            </div>
            <div className="w-full sm:w-[170px]">
              <SelectInput
                value={feeExportFormat}
                onChange={(value) => setFeeExportFormat(value as ExportFormat)}
                options={exportFormatOptions}
              />
            </div>
            <button
              type="button"
              onClick={() => void exportFeeCollection()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/15 px-3 py-2 text-xs sm:text-sm font-semibold text-lime-200 hover:bg-lime-500/25 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 sm:mx-0">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <th className="py-3 pr-3 font-medium">Class / section</th>
                <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Total fees</th>
                <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Avg discount %</th>
                <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Final fees</th>
                <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Paid</th>
                <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Pending</th>
                <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Collection %</th>
                <th className="py-3 pl-2 text-right font-medium whitespace-nowrap">Due %</th>
              </tr>
            </thead>
            <tbody className="text-white/90">
              {feeRowsFiltered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-white/40">
                    No matching class / section found.
                  </td>
                </tr>
              ) : (
                feePaged.map((row) => (
                  <tr
                    key={row.classId}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="py-3 pr-3 font-semibold text-white">{row.label}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-gray-300">
                      {formatInr(row.totalFees)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-cyan-300/90">
                      {row.avgDiscountPercent.toLocaleString("en-IN")}%
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-amber-200/90">
                      {formatInr(row.finalFees)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-lime-400">
                      {formatInr(row.paidFee)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-rose-300/90">
                      {formatInr(row.pendingFee)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-lime-300/80">
                      {row.collectionPercent.toLocaleString("en-IN")}%
                    </td>
                    <td className="py-3 pl-2 text-right tabular-nums text-amber-300/80">
                      {row.duePercent.toLocaleString("en-IN")}%
                    </td>
                  </tr>
                ))
              )}
              {feeFilteredTotals && feeRowsFiltered.length > 0 ? (
                <tr className="border-t border-white/20 bg-white/[0.06] font-semibold">
                  <td className="py-3 pr-3 text-white">Filtered total</td>
                  <td className="py-3 px-2 text-right tabular-nums">{formatInr(feeFilteredTotals.totalFees)}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-cyan-300">
                    {feeFilteredAvgDiscountPercent.toLocaleString("en-IN")}%
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">{formatInr(feeFilteredTotals.finalFees)}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-lime-400">
                    {formatInr(feeFilteredTotals.paidFee)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-rose-300">
                    {formatInr(feeFilteredTotals.pendingFee)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-lime-300">
                    {feeFilteredCollectionPercent.toLocaleString("en-IN")}%
                  </td>
                  <td className="py-3 pl-2 text-right tabular-nums text-amber-300">
                    {feeFilteredDuePercent.toLocaleString("en-IN")}%
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={feePageEff}
          totalPages={feeTotalPages}
          totalRows={feeRowsFiltered.length}
          onPageChange={setFeePage}
        />
      </div>
    </div>
  );
}
