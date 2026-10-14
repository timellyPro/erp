import { useState, useMemo, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import type { TeacherRow } from "../../teachersTab/TeachersList";
import {
  fetchTeacherAttendance,
  fetchTeachersList,
  invalidateTeachersPageCache,
  mapApiTeachersToRows,
  peekTeacherAttendance,
  peekTeacherAttendanceAny,
  peekTeachersList,
  peekTeachersListAny,
  setTeacherAttendanceCache,
  warmTeachersPage,
} from "@/lib/teacher/fetchTeachersPage";
import { downloadTeacherAttendanceReportPdf } from "@/lib/teacher/teacherAttendanceReportPdf";
import { ATTENDANCE_STATUSES, attendanceRowsToMap, toLocalDateStr, todayStr, type AttendanceStatus } from "./teachersTabHelpers";
import {
  fetchTeacherAttendanceForDate,
  saveTeacherAttendance as saveTeacherAttendanceApi,
} from "@/lib/api/teacherAttendance";
import { fetchMySchool } from "@/lib/api/school";

export function useTeachersTabState() {
  const { data: session } = useSession();
  const schoolId = session?.user?.schoolId ?? null;

  const initialList = peekTeachersListAny();
  const initialAttendance = peekTeacherAttendanceAny(todayStr());

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [teachers, setTeachers] = useState<TeacherRow[]>(() =>
    initialList ? mapApiTeachersToRows(initialList) : []
  );
  const [teachersLoading, setTeachersLoading] = useState(() => !initialList);
  const [teachersRevalidating, setTeachersRevalidating] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherRow | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(() => todayStr());
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>(
    () => attendanceRowsToMap(initialAttendance)
  );
  const [attendanceLoading, setAttendanceLoading] = useState(() => !initialAttendance);
  const [saveAttendanceLoading, setSaveAttendanceLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (schoolId) warmTeachersPage(schoolId);
  }, [schoolId]);

  const loadTeachers = useCallback(
    async (revalidate = false) => {
      if (!schoolId) return;

      if (!revalidate) {
        const cached = peekTeachersList(schoolId) ?? peekTeachersListAny();
        if (cached) {
          setTeachers(mapApiTeachersToRows(cached));
          setTeachersLoading(false);
          setTeachersRevalidating(true);
          void loadTeachers(true);
          return;
        }
      }

      setTeachersLoading((prev) => (teachers.length === 0 ? true : prev));
      setTeachersRevalidating(teachers.length > 0);
      try {
        const list = await fetchTeachersList(schoolId, { revalidate: true });
        setTeachers(mapApiTeachersToRows(list));
      } catch (err) {
        console.error("Failed to load teachers:", err);
      } finally {
        setTeachersLoading(false);
        setTeachersRevalidating(false);
      }
    },
    [schoolId, teachers.length]
  );

  useEffect(() => {
    if (!schoolId) return;
    void loadTeachers(false);
  }, [schoolId, loadTeachers]);

  const loadAttendance = useCallback(
    async (revalidate = false) => {
      if (!schoolId || !attendanceDate) return;

      if (!revalidate) {
        const cached =
          peekTeacherAttendance(schoolId, attendanceDate) ??
          (attendanceDate === todayStr() ? peekTeacherAttendanceAny(attendanceDate) : null);
        if (cached) {
          setAttendanceMap(attendanceRowsToMap(cached));
          setAttendanceLoading(false);
          void loadAttendance(true);
          return;
        }
        setAttendanceLoading(true);
      }

      try {
        const rows = await fetchTeacherAttendance(schoolId, attendanceDate, { revalidate: true });
        setAttendanceMap(attendanceRowsToMap(rows));
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error("Failed to load attendance:", err);
        }
      } finally {
        setAttendanceLoading(false);
      }
    },
    [schoolId, attendanceDate]
  );

  useEffect(() => {
    if (!schoolId || !attendanceDate) return;
    void loadAttendance(false);
  }, [schoolId, attendanceDate, loadAttendance]);

  const refreshTeachers = useCallback(() => {
    if (!schoolId) return;
    invalidateTeachersPageCache(schoolId);
    void fetchTeachersList(schoolId, { revalidate: true }).then((list) =>
      setTeachers(mapApiTeachersToRows(list))
    );
  }, [schoolId]);

  const teachersWithAttendance = useMemo(() => {
    return teachers.map((t) => {
      const status = attendanceMap[t.id] || "PRESENT";
      const isPresent = status === "PRESENT" || status === "LATE";
      return {
        ...t,
        attendance: isPresent ? 100 : status === "ON_LEAVE" ? 0 : 0,
        status: (status === "ON_LEAVE" ? "On Leave" : "Active") as "Active" | "On Leave",
      };
    });
  }, [teachers, attendanceMap]);

  const filteredTeachers = useMemo(() => {
    return teachersWithAttendance.filter((t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.teacherId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, teachersWithAttendance]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, teachersWithAttendance.length]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedTeachers = useMemo(
    () => filteredTeachers.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredTeachers, safePage]
  );

  const handleDelete = (id: string) => {
    if (confirm("Do you really want to remove this teacher from the list? Contact admin for permanent removal. This action cannot be undone.")) {
      setTeachers((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleEditTeacher = (teacher: TeacherRow) => {
    setEditingTeacher(teacher);
  };

  const handleSaveTeacher = (updatedTeacher: TeacherRow) => {
    setTeachers((prev) =>
      prev.map((t) => (t.id === updatedTeacher.id ? { ...t, ...updatedTeacher } : t))
    );
  };

  const setTeacherAttendance = (teacherId: string, status: AttendanceStatus) => {
    setAttendanceMap((prev) => ({ ...prev, [teacherId]: status }));
  };

  const markAllPresent = () => {
    const next: Record<string, AttendanceStatus> = {};
    teachers.forEach((t) => { next[t.id] = "PRESENT"; });
    setAttendanceMap(next);
  };

  const saveAttendance = async () => {
    if (!schoolId) return;
    setSaveAttendanceLoading(true);
    const attendances = teachers.map((t) => ({
      teacherId: t.id,
      status: attendanceMap[t.id] || "PRESENT",
    }));
    // Optimistic: keep UI responsive and warm client cache immediately.
    setTeacherAttendanceCache(schoolId, attendanceDate, attendances);
    try {
      const { ok, data } = await saveTeacherAttendanceApi(attendanceDate, attendances);
      if (!ok) throw new Error(data.message || "Failed to save");
      // Soft refresh in background — don't block UI or wipe the list.
      void fetchTeacherAttendance(schoolId, attendanceDate, { revalidate: true })
        .then((rows) => setAttendanceMap(attendanceRowsToMap(rows)))
        .catch(() => {});
      if (typeof window !== "undefined") window.alert("Attendance saved successfully.");
    } catch (e) {
      if (typeof window !== "undefined") window.alert(e instanceof Error ? e.message : "Failed to save attendance.");
    } finally {
      setSaveAttendanceLoading(false);
    }
  };

  const presentCount = Object.values(attendanceMap).filter((s) => s === "PRESENT" || s === "LATE").length;
  const onLeaveCount = Object.values(attendanceMap).filter((s) => s === "ON_LEAVE").length;
  const lateCount = Object.values(attendanceMap).filter((s) => s === "LATE").length;
  const absentCount = Object.values(attendanceMap).filter((s) => s === "ABSENT").length;
  const overallPct = teachers.length ? Math.round((presentCount / teachers.length) * 100) : 0;

  const downloadReportAsPdf = async () => {
    setPdfLoading(true);
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const dates: string[] = [];
      for (let d = new Date(startOfMonth); d.getTime() <= today.getTime(); d.setDate(d.getDate() + 1)) {
        dates.push(toLocalDateStr(d));
      }
      if (dates.length === 0) {
        dates.push(toLocalDateStr(today));
      }
      const periodStart = dates[0];
      const periodEnd = dates[dates.length - 1];

      const allAttendances = await Promise.all(
        dates.map((date) => fetchTeacherAttendanceForDate(date).then(({ data }) => data))
      );
      const byDate: Record<string, Record<string, string>> = {};
      dates.forEach((date, i) => {
        byDate[date] = {};
        (allAttendances[i]?.attendances || []).forEach((a: { teacherId: string; status: string }) => {
          byDate[date][a.teacherId] = a.status || "PRESENT";
        });
      });

      const { data: schoolPayload } = await fetchMySchool();
      const school = schoolPayload?.school as
        | {
            name?: string;
            address?: string;
            location?: string;
            affiliationLine?: string;
            logoUrl?: string | null;
          }
        | null
        | undefined;

      await downloadTeacherAttendanceReportPdf({
        filename: `teacher-attendance-${periodStart}-to-${periodEnd}.pdf`,
        school,
        periodStart,
        periodEnd,
        dates,
        teachers: teachersWithAttendance.map((t) => ({
          id: t.id,
          teacherId: t.teacherId,
          name: t.name,
          subject: t.subject,
          phone: t.phone,
        })),
        byDate,
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to generate PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  return {
    schoolId,
    searchTerm,
    setSearchTerm,
    teachers,
    teachersLoading,
    teachersRevalidating,
    editingTeacher,
    setEditingTeacher,
    attendanceDate,
    setAttendanceDate,
    attendanceMap,
    attendanceLoading,
    saveAttendanceLoading,
    pdfLoading,
    refreshTeachers,
    filteredTeachers,
    safePage,
    totalPages,
    pagedTeachers,
    setPage,
    handleDelete,
    handleEditTeacher,
    handleSaveTeacher,
    setTeacherAttendance,
    markAllPresent,
    saveAttendance,
    presentCount,
    onLeaveCount,
    lateCount,
    absentCount,
    overallPct,
    downloadReportAsPdf,
    ATTENDANCE_STATUSES,
  };
}
