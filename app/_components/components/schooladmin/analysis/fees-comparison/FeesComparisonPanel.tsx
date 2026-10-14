"use client";

import { CalendarDays, FileSpreadsheet, FileText } from "lucide-react";
import AnalysisSectionNav from "../../AnalysisSectionNav";
import { useFeesComparisonState } from "./shared";
import { exportExcel } from "./shared";
import { exportPdf } from "./shared";
import { DateField, FeesComparisonTable } from "./shared";

export default function FeesComparisonPanel() {
  const {
    rangeAFrom,
    setRangeAFrom,
    rangeATo,
    setRangeATo,
    rangeBFrom,
    setRangeBFrom,
    rangeBTo,
    setRangeBTo,
    report,
    loading,
    error,
    loadReport,
    hasRows,
  } = useFeesComparisonState();

  return (
    <div className="p-4 text-white sm:p-6">
      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-2xl sm:p-5">
        <div className="mb-3 border-b border-white/10 pb-3">
          <p className="text-sm font-semibold tracking-tight text-white sm:text-base">Analysis</p>
          <p className="mt-0.5 text-xs text-white/55 sm:text-sm">
            Compare fee and petty cash collections across two custom date ranges.
          </p>
        </div>
        <AnalysisSectionNav embedded />
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-2xl sm:p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Fees Comparison</h2>
            <p className="mt-1 text-sm text-white/55">
              Compare two date ranges across admission, tuition, mess, hostel, transport, other fee heads, and petty cash accounts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!report || loading}
              onClick={() => report && exportExcel(report)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
            <button
              type="button"
              disabled={!report || loading}
              onClick={() => report && exportPdf(report)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/35 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              PDF
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Range 1</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DateField label="From" value={rangeAFrom} onChange={setRangeAFrom} />
              <DateField label="To" value={rangeATo} onChange={setRangeATo} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Range 2</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DateField label="From" value={rangeBFrom} onChange={setRangeBFrom} />
              <DateField label="To" value={rangeBTo} onChange={setRangeBTo} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadReport({ revalidate: true })}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" />
            {loading ? "Loading..." : "Compare"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:rounded-2xl sm:p-5">
        <FeesComparisonTable report={report} loading={loading} hasRows={hasRows} />
      </div>
    </div>
  );
}
