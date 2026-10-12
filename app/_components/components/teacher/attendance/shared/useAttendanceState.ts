import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useToastContext } from "../../../../context/ToastContext";
import {
  loadTeacherAttendanceClasses,
  peekTeacherAttendanceClasses,
} from "@/lib/teacher/loadTeacherFastTabs";
import { getErrorMessage } from "@/lib/errors/errorInfo";
import { DEFAULT_PERIOD, toClassOptions, type AttendanceStatus, type StudentRow } from "./attendanceHelpers";

export function useAttendanceState() {
  const router = useRouter();
  const toast = useToastContext();
  const initialClasses = peekTeacherAttendanceClasses();
  const [selectedClass, setSelectedClass] = useState(
    () => (initialClasses?.[0]?.id ? initialClasses[0].id : "")
  );
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [liveMode, setLiveMode] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classOptions, setClassOptions] = useState<
    { label: string; value: string }[]
  >(() => (initialClasses ? toClassOptions(initialClasses) : []));
  const [loadingClasses, setLoadingClasses] = useState(() => !initialClasses);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [copyingFromYesterday, setCopyingFromYesterday] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let isActive = true;

    const fetchClasses = async () => {
      const cached = peekTeacherAttendanceClasses();
      if (cached?.length) {
        const options = toClassOptions(cached);
        if (isActive) {
          setClassOptions(options);
          setSelectedClass((prev) => prev || options[0]?.value || "");
          setLoadingClasses(false);
        }
      } else if (isActive) {
        setLoadingClasses(true);
      }

      try {
        const list = await loadTeacherAttendanceClasses({ revalidate: true });
        const options = toClassOptions(list);
        if (!isActive) return;
        setClassOptions(options);
        setSelectedClass((prev) => prev || options[0]?.value || "");
      } catch (error: unknown) {
        if (isActive && !peekTeacherAttendanceClasses()?.length) {
          toast.show(getErrorMessage(error) || "Failed to load classes", "error");
        }
      } finally {
        if (isActive) setLoadingClasses(false);
      }
    };

    fetchClasses();

    return () => {
      isActive = false;
    };
  }, [toast]);

  useEffect(() => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }

    let isActive = true;

    const fetchStudents = async () => {
      setLoadingStudents(true);
      try {
        const [classRes, attRes] = await Promise.all([
          fetch(`/api/class/${selectedClass}`),
          fetch(
            `/api/attendance/view?classId=${encodeURIComponent(selectedClass)}&date=${encodeURIComponent(selectedDate)}`,
            { credentials: "include" }
          ),
        ]);
        const data = await classRes.json();
        if (!classRes.ok) {
          throw new Error(data?.message || "Failed to load students");
        }

        const attData = attRes.ok ? await attRes.json() : { attendances: [] };
        const statusByStudentId: Record<string, AttendanceStatus> = {};
        (attData?.attendances ?? []).forEach((a: { studentId: string; status: string }) => {
          const s = (a.status || "PRESENT").toLowerCase();
          if (s === "present" || s === "absent" || s === "late") {
            statusByStudentId[a.studentId] = s as AttendanceStatus;
          }
        });

        const classData = data?.class;
        const mappedStudents: StudentRow[] = Array.isArray(
          classData?.students
        )
          ? classData.students.map((student: {
            id: string;
            rollNo?: string | null;
            name?: string | null;
            photoUrl?: string | null;
            user?: { name?: string | null; photoUrl?: string | null } | null;
          }, index: number) => ({
              id: student.id,
              roll: student.rollNo || `${index + 1}`.padStart(2, "0"),
              name: student.user?.name || student.name || "Unknown",
              avatar:
                student.user?.photoUrl ||
                student.photoUrl ||
                `https://i.pravatar.cc/80?u=${student.id}`,
              status: statusByStudentId[student.id] ?? "present",
            }))
          : [];

        if (!isActive) return;
        setStudents(mappedStudents);
      } catch (error: unknown) {
        if (isActive) {
          toast.show(getErrorMessage(error) || "Failed to load students", "error");
          setStudents([]);
        }
      } finally {
        if (isActive) setLoadingStudents(false);
      }
    };

    fetchStudents();

    return () => {
      isActive = false;
    };
  }, [selectedClass, selectedDate, toast]);

  const stats = useMemo(() => {
    const present = students.filter((s) => s.status === "present").length;
    const absent = students.filter((s) => s.status === "absent").length;
    const late = students.filter((s) => s.status === "late").length;
    const total = students.length;
    const rate = total ? Math.round((present / total) * 1000) / 10 : 0;
    return { present, absent, late, total, rate };
  }, [students]);

  const selectedClassLabel = useMemo(() => {
    return (
      classOptions.find((option) => option.value === selectedClass)?.label ||
      ""
    );
  }, [classOptions, selectedClass]);

  const handleCopyFromYesterday = async () => {
    if (!selectedClass || students.length === 0) {
      toast.show("Please select a class with students first", "warning");
      return;
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    setCopyingFromYesterday(true);
    try {
      const res = await fetch(
        `/api/attendance/view?classId=${encodeURIComponent(selectedClass)}&date=${yesterdayStr}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to fetch yesterday's attendance");
      const attendances = data?.attendances ?? [];
      const statusByStudentId: Record<string, AttendanceStatus> = {};
      attendances.forEach((a: { studentId: string; status: string }) => {
        statusByStudentId[a.studentId] = a.status.toLowerCase() as AttendanceStatus;
      });
      setStudents((prev) =>
        prev.map((s) => ({
          ...s,
          status: statusByStudentId[s.id] ?? "present",
        }))
      );
      toast.show("Copied attendance from yesterday", "success");
    } catch (error: unknown) {
      toast.show(getErrorMessage(error) || "Failed to copy from yesterday", "error");
    } finally {
      setCopyingFromYesterday(false);
    }
  };

  const handleExportReport = () => {
    if (!selectedClassLabel || students.length === 0) {
      toast.show("No attendance data to export", "warning");
      return;
    }
    const headers = ["Roll No", "Student Name", "Status", "Date"];
    const rows = students.map((s) => [
      s.roll,
      s.name,
      s.status.charAt(0).toUpperCase() + s.status.slice(1),
      selectedDate,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${selectedClassLabel.replace(/\s+/g, "-")}-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show("Report exported", "success");
  };

  const handleSaveAttendance = async () => {
    if (savingAttendance) return;

    if (loadingStudents) {
      toast.show("Students are still loading", "warning");
      return;
    }

    if (!selectedClass) {
      toast.show("Please select a class first", "warning");
      return;
    }

    if (!students.length) {
      toast.show("No students found for this class", "warning");
      return;
    }

    setSavingAttendance(true);
    try {
      const payload = {
        classId: selectedClass,
        date: selectedDate,
        period: DEFAULT_PERIOD,
        attendances: students.map((student) => ({
          studentId: student.id,
          status: student.status.toUpperCase(),
        })),
      };

      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to save attendance");
      }

      try {
        const sync = await fetch(
          `/api/attendance/view?classId=${encodeURIComponent(selectedClass)}&date=${encodeURIComponent(selectedDate)}`,
          { credentials: "include" }
        );
        const syncData = sync.ok ? await sync.json() : { attendances: [] };
        const statusByStudentId: Record<string, AttendanceStatus> = {};
        (syncData?.attendances ?? []).forEach((a: { studentId: string; status: string }) => {
          const s = (a.status || "PRESENT").toLowerCase();
          if (s === "present" || s === "absent" || s === "late") {
            statusByStudentId[a.studentId] = s as AttendanceStatus;
          }
        });
        setStudents((prev) =>
          prev.map((row) => ({
            ...row,
            status: statusByStudentId[row.id] ?? row.status,
          }))
        );
      } catch {
        /* keep local state */
      }

      try {
        router.refresh();
      } catch {
        /* noop */
      }

      setShowSuccess(true);
    } catch (error: unknown) {
      toast.show(getErrorMessage(error) || "Failed to save attendance", "error");
    } finally {
      setSavingAttendance(false);
    }
  };

  return {
    selectedClass,
    setSelectedClass,
    selectedDate,
    setSelectedDate,
    liveMode,
    setLiveMode,
    students,
    setStudents,
    classOptions,
    loadingClasses,
    loadingStudents,
    savingAttendance,
    copyingFromYesterday,
    showSuccess,
    setShowSuccess,
    stats,
    selectedClassLabel,
    handleCopyFromYesterday,
    handleExportReport,
    handleSaveAttendance,
  };
}
