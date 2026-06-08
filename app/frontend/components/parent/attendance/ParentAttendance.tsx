"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useSession } from "next-auth/react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  XCircle,
  Download,
  Loader2,
} from "lucide-react";
import PageHeader from "../../common/PageHeader";
import StatCard from "../../common/statCard";
import {
  addMonths,
  buildCalendarCells,
  buildDailyStatus,
  firstDayOfMonth,
  formatMonthLabel,
  formatPercent,
  formatTrend,
  fromDateKey,
  LEGEND_STATUSES,
  normalizeStatus,
  parseApiDateKey,
  STATUS_META,
  toDateKey,
  type AttendanceRecord,
  type DayStatus,
  type StudentDetailResponse,
  WEEK_DAYS,
} from "./attendanceUtils";
import ParentTimellyLoader from "../ParentTimellyLoader";
import { fetchParentAttendance, peekParentPortalAny } from "@/lib/loadParentPortal";
import { downloadParentPortalPdf } from "@/lib/downloadParentPortalPdf";
import { currentAcademicYearLabel, resolveSchoolBrand, type SchoolBrand } from "@/lib/resolveSchoolBrand";
import AttendanceReportTemplate, { type AttendanceReportData } from "../../pdf/AttendanceReportTemplate";
import { useRef } from "react";

type StatCardConfig = {
  key: string;
  title: string;
  value: string | number;
  footer: string;
  badge: string;
  badgeClass: string;
  icon: LucideIcon;
  iconClass: string;
  iconBoxClass: string;
  valueClass: string;
};

export default function ParentAttendanceTab() {
  const { data: session } = useSession();
  const studentId = session?.user?.studentId ?? null;
  const sessionSchoolName =
    typeof (session?.user as any)?.schoolName === "string" ? (session?.user as any).schoolName : "";

  const getAcademicYearRangeStatic = (seedDate = new Date()) => {
    const year = seedDate.getFullYear();
    const month = seedDate.getMonth();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    return {
      startDate: `${startYear}-04-01`,
      endDate: `${endYear}-03-31`,
      startYear,
      endYear,
    };
  };

  const initialAy = getAcademicYearRangeStatic();
  const initialAttendanceKey = `startDate=${initialAy.startDate}&endDate=${initialAy.endDate}`;
  const initialPeek = peekParentPortalAny<{ attendances: AttendanceRecord[] }>(
    "attendance",
    initialAttendanceKey
  );

  const [monthCursor, setMonthCursor] = useState(firstDayOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>(() => initialPeek?.attendances ?? []);
  const [dailyStatus, setDailyStatus] = useState<Record<string, "PRESENT" | "ABSENT" | "LATE" | "HOLIDAY">>(() =>
    initialPeek?.attendances?.length ? buildDailyStatus(initialPeek.attendances) : {}
  );
  const [studentName, setStudentName] = useState("your child");
  const [studentClassLabel, setStudentClassLabel] = useState("");
  const [schoolName, setSchoolName] = useState(sessionSchoolName || "");
  const [loading, setLoading] = useState(!initialPeek?.attendances?.length);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [schoolBrand, setSchoolBrand] = useState<SchoolBrand | null>(null);
  const [pdfReportData, setPdfReportData] = useState<AttendanceReportData | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void resolveSchoolBrand().then(setSchoolBrand);
  }, []);

  const getAcademicYearRange = (seedDate = new Date()) => {
    const year = seedDate.getFullYear();
    const month = seedDate.getMonth();
    const startYear = month >= 3 ? year : year - 1; // Apr -> Mar
    const endYear = startYear + 1;
    return {
      startDate: `${startYear}-04-01`,
      endDate: `${endYear}-03-31`,
      startYear,
      endYear,
    };
  };

  const loadAttendance = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setError("No student is linked to this parent account.");
      return;
    }

    const currentAy = getAcademicYearRange();
    const cacheKey = `startDate=${currentAy.startDate}&endDate=${currentAy.endDate}`;
    const peeked = peekParentPortalAny<{ attendances: AttendanceRecord[] }>("attendance", cacheKey);
    if (!peeked?.attendances?.length) setLoading(true);
    setError(null);

    try {
      const data = await fetchParentAttendance(
        studentId,
        currentAy.startDate,
        currentAy.endDate
      );
      const list = Array.isArray(data?.attendances)
        ? (data.attendances as AttendanceRecord[])
        : [];
      setRecords(list);
      setDailyStatus(buildDailyStatus(list));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance records.");
      setRecords([]);
      setDailyStatus({});
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    if (!studentId) return;
    let active = true;

    (async () => {
      try {
        const res = await fetch(`/api/student/${studentId}`, { credentials: "include" });
        if (!res.ok || !active) return;
        const studentData = (await res.json()) as StudentDetailResponse;
        const name = studentData?.student?.name?.trim();
        if (name) setStudentName(name);
        const school = studentData?.student?.schoolName?.trim();
        if (school) setSchoolName(school);

        const cls =
          studentData?.student?.class?.displayName?.trim() ||
          [studentData?.student?.class?.name, studentData?.student?.class?.section]
            .filter(Boolean)
            .join("-");
        setStudentClassLabel(cls || "");
      } catch {
        // fallback is intentional
      }
    })();

    return () => {
      active = false;
    };
  }, [studentId]);

  useEffect(() => {
    const monthPrefix = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;
    if (selectedDateKey.startsWith(monthPrefix)) return;
    const today = new Date();
    if (today.getMonth() === monthCursor.getMonth() && today.getFullYear() === monthCursor.getFullYear()) {
      setSelectedDateKey(toDateKey(today));
      return;
    }
    const firstRecordInMonth = Object.keys(dailyStatus).find((key) => key.startsWith(monthPrefix));
    setSelectedDateKey(firstRecordInMonth || `${monthPrefix}-01`);
  }, [dailyStatus, monthCursor, selectedDateKey]);

  const academicYearSummary = useMemo(() => {
    const { startDate, endDate, startYear } = getAcademicYearRange();
    const previousAyStartDate = `${startYear - 1}-04-01`;
    const previousAyEndDate = `${startYear}-03-31`;

    const summarizeRange = (rangeStart: string, rangeEnd: string) => {
      const start = new Date(rangeStart);
      const end = new Date(rangeEnd);
      let present = 0;
      let absent = 0;
      let late = 0;

      Object.entries(dailyStatus).forEach(([dateKey, status]) => {
        const date = fromDateKey(dateKey);
        if (!date || date < start || date > end) return;
        if (status === "PRESENT") present += 1;
        if (status === "ABSENT") absent += 1;
        if (status === "LATE") late += 1;
      });

      const total = present + absent + late;
      const presentRate = total > 0 ? (present / total) * 100 : 0;
      return { present, absent, late, total, presentRate };
    };

    const current = summarizeRange(startDate, endDate);
    const previous = summarizeRange(previousAyStartDate, previousAyEndDate);
    const presentRateDelta = current.presentRate - previous.presentRate;

    return { ...current, presentRateDelta };
  }, [dailyStatus]);

  const statCards = useMemo<StatCardConfig[]>(
    () => [
      {
        key: "present-rate",
        title: "Present Rate",
        value: formatPercent(academicYearSummary.presentRate),
        footer: `${academicYearSummary.present} days present`,
        badge: formatTrend(academicYearSummary.presentRateDelta),
        badgeClass:
          academicYearSummary.presentRateDelta >= 0
            ? "px-2 py-1 bg-[#A3E635]/20 text-[#A3E635] text-xs font-semibold rounded-full border border-[#A3E635]/30"
            : "px-2 py-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded-full border border-red-500/30",
        icon: CheckCircle2,
        iconClass: "text-lime-300",
        iconBoxClass: "bg-lime-400/15 border-lime-400/20",
        valueClass: "text-2xl font-bold text-white mb-1",
      },
      {
        key: "absent",
        title: "Absent",
        value: academicYearSummary.absent,
        footer: "Days missed",
        badge: "Alert",
        badgeClass: "px-2 py-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded-full border border-red-500/30",
        icon: XCircle,
        iconClass: "text-red-300",
        iconBoxClass: "p-2 bg-red-500/10 rounded-lg",
        valueClass: "text-2xl font-bold text-red-500 mb-1",
      },
      {
        key: "late",
        title: "Late Arrivals",
        value: academicYearSummary.late,
        footer: "Academic year",
        badge: "Track",
        badgeClass: "px-2 py-1 bg-white/[0.05] text-white/70 text-xs font-semibold rounded-full border border-white/[0.1]",
        icon: Clock3,
        iconClass: "text-orange-300",
        iconBoxClass: "text-2xl font-bold text-orange-500 mb-1",
        valueClass: "text-orange-300",
      },
      {
        key: "total",
        title: "Total Days",
        value: academicYearSummary.total,
        footer: "School days",
        badge: "Total",
        badgeClass: "px-2 py-1 bg-white/[0.05] text-white/70 text-xs font-semibold rounded-full border border-white/[0.1]",
        icon: CalendarDays,
        iconClass: "text-lime-300",
        iconBoxClass: "bg-lime-400/15 border-lime-300/20",
        valueClass: "text-2xl font-bold text-white mb-1",
      },
    ],
    [academicYearSummary]
  );
  const calendarCells = useMemo(
    () => buildCalendarCells(monthCursor, selectedDateKey, dailyStatus),
    [dailyStatus, monthCursor, selectedDateKey]
  );

  const selectedDayStatus = useMemo<DayStatus>(() => {
    const date = fromDateKey(selectedDateKey);
    if (!date || date.getMonth() !== monthCursor.getMonth() || date.getFullYear() !== monthCursor.getFullYear()) {
      return "NONE";
    }
    const normalized = dailyStatus[selectedDateKey];
    if (normalized) return normalized;
    return date.getDay() === 0 ? "WEEKEND" : "NONE";
  }, [dailyStatus, monthCursor, selectedDateKey]);

  const selectedDayLabel = useMemo(() => {
    const date = fromDateKey(selectedDateKey);
    return date
      ? date.toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
      : "No date selected";
  }, [selectedDateKey]);

  const selectedDayRecords = useMemo(
    () =>
      records
        .filter((record) => parseApiDateKey(record.date) === selectedDateKey)
        .sort((a, b) => a.period - b.period),
    [records, selectedDateKey]
  );

  const headerSubtitle = studentClassLabel
    ? `Track ${studentName}'s attendance record (${studentClassLabel})`
    : `Track ${studentName}'s attendance record`;

  const reportData: AttendanceReportData = useMemo(
    () => ({
      schoolName: schoolBrand?.name || schoolName,
      schoolLogo: schoolBrand?.logo,
      schoolAddress: schoolBrand?.address,
      studentName,
      studentClass: studentClassLabel,
      academicYear: currentAcademicYearLabel(),
      dateGenerated: new Date(),
      summary: {
        present: academicYearSummary.present,
        absent: academicYearSummary.absent,
        late: academicYearSummary.late,
        total: academicYearSummary.total,
        presentRate: academicYearSummary.presentRate,
      },
    }),
    [schoolBrand, schoolName, studentName, studentClassLabel, academicYearSummary]
  );

  const handleDownloadReport = async () => {
    setGeneratingPdf(true);
    try {
      await downloadParentPortalPdf({
        ref: reportRef,
        filename: `Attendance_Report_${studentName.replace(/\s+/g, "_")}.pdf`,
        beforeCapture: (brand) => {
          flushSync(() => {
            setPdfReportData({
              ...reportData,
              schoolName: brand.name,
              schoolLogo: brand.logo,
              schoolAddress: brand.address,
            });
          });
        },
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download report.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.key} className="bg-[rgba(255,255,255,0.05)] backdrop-blur-xl
           border border-[rgba(255,255,255,0.1)] border-solid rounded-2xl
            shadow-[0px_10px_15px_0px_rgba(0,0,0,0.1),0px_4px_6px_0px_rgba(0,0,0,0.1)] transition-all duration-300 hover:-translate-y-1
             hover:bg-[rgba(255,255,255,0.08)]
           hover:shadow-[0px_15px_20px_0px_rgba(0,0,0,0.15),0px_6px_8px_0px_rgba(0,0,0,0.15)] p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-[#A3E635]/10 rounded-lg ${card.iconBoxClass}`}>
                  <card.icon className={` w-5 h-5 text-[#A3E635] ${card.iconClass}`} />
                </div>
              </div>
              <span className={`${card.badgeClass}`}>
                {card.badge}
              </span>
            </div>
             <div>
                  <p className="text-xs font-medium text-white/70 mb-1 mt-3">{card.title}</p>
                  <p className={`${card.valueClass}`}>{card.value}</p>
                    <p className="text-xs text-white/70">{card.footer}</p>
                </div>
         
          </StatCard>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 sm:px-8 sm:py-5
        px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
          <h2 className="text-xl font-bold text-white">{formatMonthLabel(monthCursor)}</h2>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonthCursor((prev) => addMonths(prev, -1))}
              className="p-2 rounded-lg bg-white/[0.05] border 
              border-white/[0.1] hover:bg-white/[0.1] hover:text-white text-white/70 transition-all"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}
              className="p-2 rounded-lg bg-white/[0.05] border border-white/[0.1]
               hover:bg-white/[0.1] hover:text-white text-white/70 transition-all0"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-3 py-3 sm:px-8 sm:py-5">
          <div className="flex flex-wrap gap-3">
            {LEGEND_STATUSES.map((status) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-md ${STATUS_META[status].dotClass}`} />
                <span className="text-xs text-white/70 font-medium">{STATUS_META[status].label}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-white/10 pt-4 sm:mt-6 sm:pt-6">
            <div className="grid grid-cols-7 gap-1.5 sm:gap-3 text-center text-[11px] sm:text-sm font-bold tracking-wide text-white/45">
              {WEEK_DAYS.map((day) => (
                <div key={day} className="text-center font-bold text-white/50 text-xs uppercase tracking-wider py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="mt-1.5 sm:mt-2 grid grid-cols-7 gap-1.5 sm:gap-3">
              {calendarCells.map((cell) => {
                if (cell.isPlaceholder) {
                  return <div key={cell.key} className="aspect-square" aria-hidden="true" />;
                }

                const bg = STATUS_META[cell.status].cardBg;
                const text = cell.isSelected
                  ? "text-black"
                  : STATUS_META[cell.status].textClass;

                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => cell.isCurrentMonth && setSelectedDateKey(cell.key)}
                    disabled={!cell.isCurrentMonth}
                    aria-hidden={!cell.isCurrentMonth}
                    className={[
                      "aspect-square rounded-xl flex items-center justify-center font-semibold transition-all duration-300 relative hover:scale-105 border",
                      bg,
                      cell.isCurrentMonth ? "hover:brightness-110" : "cursor-default pointer-events-none",
                      cell.isSelected
                        ? "!border-white/90 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.7)]"
                        : "",
                      cell.isToday && !cell.isSelected ? "ring-1 ring-white/35" : "",
                    ].join(" ")}
                  >
                    <span className={text}>{cell.day}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-3.5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg sm:text-xl font-semibold text-white">{selectedDayLabel}</h3>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_META[selectedDayStatus].cardBg} ${STATUS_META[selectedDayStatus].textClass}`}
          >
            {STATUS_META[selectedDayStatus].label}
          </span>
        </div>

        <div className="mt-4">
          {selectedDayRecords.length ? (
            <div className="flex flex-wrap gap-2">
              {selectedDayRecords.map((record) => {
                const status = normalizeStatus(record.status) ?? "PRESENT";
                return (
                  <span
                    key={record.id}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${STATUS_META[status].cardBg} ${STATUS_META[status].textClass}`}
                  >
                    Period {record.period}: {status}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-white/60">No period-wise attendance records are available for this date.</p>
          )}
        </div>
      </section>

      {mounted ? (
        <AttendanceReportTemplate ref={reportRef} data={pdfReportData ?? reportData} />
      ) : null}
    </div>
  );
}
