"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import SelectInput from "../../common/SelectInput";
import InlinePagination from "../schooladmincomponents/InlinePagination";
import { isInactiveStudentStatus } from "@/lib/students/resolveStudentDisplayClass";
import { todayYmdLocal } from "@/lib/school/schoolDashboardCollection";
import {
  PAGE_SIZE,
  type ExportFormat,
  type FeeRecordsTableProps,
  type ReportPeriod,
  type StudentStatusFilter,
} from "./shared";
import { FeeRecordsRows } from "./shared";
import { UseFeeRecordsExportActions as useFeeRecordsExportActions } from "./shared";

export default function FeeRecordsTable({ fees, classes }: FeeRecordsTableProps) {
  const router = useRouter();
  const [searchName, setSearchName] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<StudentStatusFilter>("Active");
  const [selectedHead, setSelectedHead] = useState("");
  const [feeHeadOptions, setFeeHeadOptions] = useState<string[]>([]);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("DAY_WISE");
  const [reportDateFrom, setReportDateFrom] = useState(() => todayYmdLocal());
  const [reportDateTo, setReportDateTo] = useState(() => todayYmdLocal());
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [academicYear, setAcademicYear] = useState(() => {
    const now = new Date();
    const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}-${start + 1}`;
  });
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [page, setPage] = useState(1);

  const statusFilteredFees = fees.filter((f) => {
    const inactive = isInactiveStudentStatus(f.student.status);
    if (studentStatusFilter === "Active") return !inactive;
    if (studentStatusFilter === "Inactive") return inactive;
    return true;
  });

  const filteredFees = statusFilteredFees.filter((f) => {
    const name = (f.student.user?.name || "").toLowerCase();
    const q = searchName.toLowerCase();
    if (q && !name.includes(q)) return false;
    if (selectedClass && f.student.class?.id !== selectedClass) return false;
    return true;
  });

  useEffect(() => {
    setPage(1);
  }, [searchName, selectedClass, studentStatusFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [structureRes, extraRes] = await Promise.all([
        fetch("/api/fees/structure", { credentials: "include" }),
        fetch("/api/fees/extra", { credentials: "include" }),
      ]);
      const structureData = (await structureRes.json().catch(() => ({}))) as {
        structures?: Array<{ components?: Array<{ name?: string }> }>;
      };
      const extraData = (await extraRes.json().catch(() => ({}))) as {
        extraFees?: Array<{ name?: string }>;
      };
      const names = new Set<string>();
      for (const structure of structureData.structures ?? []) {
        for (const component of structure.components ?? []) {
          const name = String(component?.name ?? "").trim();
          if (name) names.add(name);
        }
      }
      for (const extra of extraData.extraFees ?? []) {
        const name = String(extra?.name ?? "").trim();
        if (name) names.add(name);
      }
      if (!cancelled) {
        setFeeHeadOptions([...names].sort((a, b) => a.localeCompare(b)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const {
    feeDueExporting,
    exportFinalTemplate,
    exportAllClasses,
    exportFeeDueReport,
    exportSelectedClass,
  } = useFeeRecordsExportActions({
    periodState: { reportPeriod, reportDateFrom, reportDateTo, reportMonth, reportYear, academicYear },
    exportFormat,
    selectedClass,
    selectedHead,
    studentStatusFilter,
    statusFilteredFees,
    classLabelById,
  });

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
            <p className="text-sm font-semibold text-white">Day report</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Choose a from date and a to date, then download the collections for that range.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectInput
            label="Report period"
            value={reportPeriod}
            onChange={(value) => setReportPeriod(value as ReportPeriod)}
            options={[
              { label: "Date Range", value: "DAY_WISE" },
              { label: "Month Wise", value: "MONTH_WISE" },
              { label: "Year Wise", value: "YEAR_WISE" },
              { label: "Academic Year Wise", value: "ACADEMIC_YEAR_WISE" },
            ]}
          />
          {reportPeriod === "DAY_WISE" && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">From date</label>
                <input
                  type="date"
                  value={reportDateFrom}
                  max={reportDateTo || undefined}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReportDateFrom(next);
                    if (reportDateTo && next > reportDateTo) setReportDateTo(next);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-400">To date</label>
                <input
                  type="date"
                  value={reportDateTo}
                  min={reportDateFrom || undefined}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReportDateTo(next);
                    if (reportDateFrom && next < reportDateFrom) setReportDateFrom(next);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white"
                />
              </div>
            </>
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
        <div className="w-full sm:w-auto sm:min-w-[190px]">
          <SelectInput
            value={studentStatusFilter}
            onChange={(value) => setStudentStatusFilter(value as StudentStatusFilter)}
            options={[
              { label: "Active Students", value: "Active" },
              { label: "Inactive Students", value: "Inactive" },
              { label: "All Students", value: "All" },
            ]}
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[220px]">
          <SelectInput
            value={selectedHead}
            onChange={setSelectedHead}
            options={[
              { label: "All Fee Heads", value: "" },
              ...feeHeadOptions.map((name) => ({ label: name, value: name })),
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
          onClick={() => void exportAllClasses()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-2 text-sm text-lime-300 hover:bg-lime-500/20"
        >
          <Download size={16} />
          Export All Classes
        </button>
        <button
          type="button"
          onClick={() => void exportSelectedClass()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/20"
        >
          <Download size={16} />
          Export Class-wise
        </button>
      </div>
      <FeeRecordsRows paginatedFees={paginatedFees} router={router} />
      <div className="mt-4">
        <InlinePagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </section>
  );
}
