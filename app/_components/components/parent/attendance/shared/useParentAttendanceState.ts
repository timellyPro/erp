import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSession } from "next-auth/react";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, CheckCircle2, Clock3, XCircle } from "lucide-react";
import {
  buildCalendarCells,
  buildDailyStatus,
  firstDayOfMonth,
  formatPercent,
  formatTrend,
  fromDateKey,
  normalizeStatus,
  parseApiDateKey,
  toDateKey,
  type AttendanceRecord,
  type DayStatus,
  type StudentDetailResponse,
} from "../attendanceUtils";
import { fetchParentAttendance, peekParentPortalAny } from "@/lib/parent/loadParentPortal";
import { downloadParentPortalPdf } from "@/lib/parent/downloadParentPortalPdf";
import { currentAcademicYearLabel, resolveSchoolBrand, type SchoolBrand } from "@/lib/school/resolveSchoolBrand";
import type { AttendanceReportData } from "../../../pdf/AttendanceReportTemplate";

export type StatCardConfig = {
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

export function useParentAttendanceState() {
  const { data: session } = useSession();
  const studentId = session?.user?.studentId ?? null;
  const userWithSchoolName = session?.user as { schoolName?: unknown } | undefined;
  const sessionSchoolName =
    typeof userWithSchoolName?.schoolName === "string" ? userWithSchoolName.schoolName : "";

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

  return {
    monthCursor,
    setMonthCursor,
    selectedDateKey,
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
    normalizeStatusFn: normalizeStatus,
  };
}
