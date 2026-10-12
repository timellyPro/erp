"use client";

import { AlertCircle, Download, Loader2 } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import ParentTimellyLoader from "../ParentTimellyLoader";
import AttendanceReportTemplate from "../../pdf/AttendanceReportTemplate";
import { useParentAttendanceState } from "./shared";
import { AttendanceStatCardsSection } from "./shared";
import { AttendanceCalendarSection } from "./shared";
import { SelectedDaySection } from "./shared";

export default function ParentAttendanceTab() {
  const {
    monthCursor,
    setMonthCursor,
    setSelectedDateKey,
    loading,
    error,
    loadAttendance,
    generatingPdf,
    handleDownloadReport,
    headerSubtitle,
    statCards,
    calendarCells,
    selectedDayStatus,
    selectedDayLabel,
    selectedDayRecords,
    mounted,
    reportRef,
    pdfReportData,
    reportData,
  } = useParentAttendanceState();

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Attendance" subtitle={headerSubtitle} />
        <ParentTimellyLoader preset="attendance" className="w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Attendance" subtitle={headerSubtitle} />
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-6 text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-300" />
            <div className="space-y-3">
              <p className="font-semibold">Failed to load attendance</p>
              <p className="text-sm text-red-100/80">{error}</p>
              <button
                type="button"
                onClick={loadAttendance}
                className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader title="Attendance" subtitle={headerSubtitle} />
        {!loading && !error && mounted && (
          <button
            onClick={handleDownloadReport}
            disabled={generatingPdf}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors font-medium text-sm border border-white/10 disabled:opacity-50"
          >
            {generatingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download Report
          </button>
        )}
      </div>

      <AttendanceStatCardsSection statCards={statCards} />

      <AttendanceCalendarSection
        monthCursor={monthCursor}
        setMonthCursor={setMonthCursor}
        calendarCells={calendarCells}
        onSelectDate={setSelectedDateKey}
      />

      <SelectedDaySection
        selectedDayLabel={selectedDayLabel}
        selectedDayStatus={selectedDayStatus}
        selectedDayRecords={selectedDayRecords}
      />

      {mounted ? (
        <AttendanceReportTemplate ref={reportRef} data={pdfReportData ?? reportData} />
      ) : null}
    </div>
  );
}
