"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Calendar,
  CircleDot,
  Clock,
  Copy,
  Download,
  Save,
  Users,
  XCircle,
} from "lucide-react";
import PageHeader from "../../common/PageHeader";
import TimellyLoader from "../../common/TimellyLoader";
import StatCard from "../../common/statCard";
import SearchInput from "../../common/SearchInput";
import SelectInput from "../../common/SelectInput";
import InlinePanelTable from "../../common/InlinePanelTable";
import AttendanceButton from "./AttendanceButton";
import { Column } from "../../../types/superadmin";
import SuccessPopups from "../../common/SuccessPopUps";
import { useToastContext } from "../../../context/ToastContext";
import {
  loadTeacherAttendanceClasses,
  peekTeacherAttendanceClasses,
} from "@/lib/loadTeacherFastTabs";

type AttendanceStatus = "present" | "absent" | "late";

type StudentRow = {
  id: string;
  roll: string;
  name: string;
  avatar: string;
  status: AttendanceStatus;
};

function formatLongDate(value: string) {
  const parts = value.split("-").map(Number);
  let date: Date;
  if (parts.length === 3 && parts[0] > 31) {
    const [year, month, day] = parts;
    date = new Date(year, (month ?? 1) - 1, day ?? 1);
  } else {
    const [day, month, year] = parts;
    date = new Date(year, (month ?? 1) - 1, day ?? 1);
  }
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const DEFAULT_PERIOD = 1;

function toClassOptions(classes: { id: string; name: string; section?: string | null }[]) {
  return classes.map((cls) => ({
    label: cls.section ? `${cls.name}-${cls.section}` : `${cls.name}`,
    value: cls.id,
  }));
}

export default function TeacherAttendanceTab() {
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
      } catch (error: any) {
        if (isActive && !peekTeacherAttendanceClasses()?.length) {
          toast.show(error?.message || "Failed to load classes", "error");
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
          ? classData.students.map((student: any, index: number) => ({
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
      } catch (error: any) {
        if (isActive) {
          toast.show(error?.message || "Failed to load students", "error");
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

  const columns: Column<StudentRow>[] = [
    {
      header: "Roll No",
      render: (row) => <span className="text-white/90">{row.roll}</span>,
    },
    {
      header: "Student Name",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full overflow-hidden border border-white/10">
            <img src={row.avatar} alt={row.name} className="h-full w-full object-cover" />
          </div>
          <span className="font-medium text-white">{row.name}</span>
        </div>
      ),
    },
    {
      header: "Attendance Status",
      align: "center",
      render: (row) => (
        <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2 py-1">
          <AttendanceButton
            size="sm"
            variant={row.status === "present" ? "success" : "ghost"}
            active={row.status === "present"}
            leftIcon={<CheckCircle2 size={14} />}
            className={
              row.status === "present"
                ? ""
                : "text-white/50 border-transparent bg-transparent shadow-none hover:shadow-none hover:brightness-100 hover:bg-white/10 hover:border-transparent"
            }
            onClick={() =>
              setStudents((prev) =>
                prev.map((s) => (s.id === row.id ? { ...s, status: "present" } : s))
              )
            }
          >
            Present
          </AttendanceButton>
          <AttendanceButton
            size="sm"
            variant={row.status === "absent" ? "danger" : "ghost"}
            active={row.status === "absent"}
            leftIcon={<XCircle size={14} />}
            className={
              row.status === "absent"
                ? ""
                : "text-white/50 border-transparent bg-transparent shadow-none hover:shadow-none hover:brightness-100 hover:bg-white/10 hover:border-transparent"
            }
            onClick={() =>
              setStudents((prev) =>
                prev.map((s) => (s.id === row.id ? { ...s, status: "absent" } : s))
              )
            }
          >
            Absent
          </AttendanceButton>
          <AttendanceButton
            size="sm"
            variant={row.status === "late" ? "warning" : "ghost"}
            active={row.status === "late"}
            leftIcon={<Clock size={14} />}
            className={
              row.status === "late"
                ? ""
                : "text-white/50 border-transparent bg-transparent shadow-none hover:shadow-none hover:brightness-100 hover:bg-white/10 hover:border-transparent"
            }
            onClick={() =>
              setStudents((prev) =>
                prev.map((s) => (s.id === row.id ? { ...s, status: "late" } : s))
              )
            }
          >
            Late
          </AttendanceButton>
        </div>
      ),
    },
  ];

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
    } catch (error: any) {
      toast.show(error?.message || "Failed to copy from yesterday", "error");
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
    } catch (error: any) {
      toast.show(error?.message || "Failed to save attendance", "error");
    } finally {
      setSavingAttendance(false);
    }
  };

  return (
    <div className="min-h-screen text-white px-3 sm:px-6 lg:px-8 py-4 space-y-4 sm:space-y-6 pb-20 sm:pb-6 overflow-x-hidden">
      <PageHeader
        title="Attendance Management"
        subtitle="Mark and manage student attendance"
      />

      {loadingClasses && classOptions.length === 0 && (
        <TimellyLoader title="Loading classes" steps={["Classes", "Students", "Attendance"]} />
      )}

      <section className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard className="bg-white/5 relative p-4 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-lime-400/20 border border-lime-400/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={18} className="text-lime-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-white/60">Present</p>
              <p className="text-xl sm:text-2xl font-semibold text-white">{stats.present}</p>
            </div>
          </div>
        </StatCard>
        <StatCard className="bg-white/5 relative p-4 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-red-500/20 border border-red-500/20 flex items-center justify-center flex-shrink-0">
              <XCircle size={18} className="text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-white/60">Absent</p>
              <p className="text-xl sm:text-2xl font-semibold text-white">{stats.absent}</p>
            </div>
          </div>
        </StatCard>
        <StatCard className="bg-white/5 relative p-4 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-amber-400/20 border border-amber-400/20 flex items-center justify-center flex-shrink-0">
              <Clock size={18} className="text-amber-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-white/60">Late</p>
              <p className="text-xl sm:text-2xl font-semibold text-white">{stats.late}</p>
            </div>
          </div>
        </StatCard>
        <StatCard className="bg-white/5 relative p-4 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0">
              <Users size={18} className="text-white/60" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-white/60">Total</p>
              <p className="text-xl sm:text-2xl font-semibold text-white">{stats.total}</p>
            </div>
          </div>
        </StatCard>
      </section>

      <section className="rounded-xl sm:rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.1fr] gap-3 sm:gap-4 items-end">
          <SelectInput
            label="Select Class"
            value={selectedClass}
            onChange={setSelectedClass}
            options={
              loadingClasses
                ? [{ label: "Loading classes...", value: "", disabled: true }]
                : classOptions.length
                ? classOptions
                : [{ label: "No classes available", value: "", disabled: true }]
            }
            disabled={loadingClasses || classOptions.length === 0}
          />
          <SearchInput
            label="Select Date"
            value={selectedDate}
            onChange={setSelectedDate}
            placeholder="YYYY-MM-DD"
            type="date"
            icon={Calendar}
            iconPosition="right"
            iconClickable
            iconAriaLabel="Open calendar"
            inputClassName="appearance-none [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
            variant="glass"
          />
          <div className="flex sm:col-span-2 lg:col-span-1">
            <AttendanceButton
              variant={liveMode ? "success" : "neutral"}
              className="w-full px-4 sm:px-6 py-2.5 text-sm"
              leftIcon={
                <CircleDot
                  size={16}
                  className={liveMode ? "text-black/80" : "text-white/60"}
                />
              }
              onClick={() => setLiveMode((prev) => !prev)}
            >
              {liveMode ? "Live Mode Active" : "Start Live Attendance"}
            </AttendanceButton>
          </div>
        </div>

        <div className="h-px bg-white/10" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <AttendanceButton
            variant="primary"
            leftIcon={<CheckCircle2 size={16} />}
            className="w-full"
            onClick={() =>
              setStudents((prev) => prev.map((s) => ({ ...s, status: "present" })))
            }
            disabled={students.length === 0}
          >
            Mark All Present
          </AttendanceButton>
          <AttendanceButton
            variant="ghost"
            leftIcon={<Copy size={16} />}
            className="w-full"
            onClick={handleCopyFromYesterday}
            disabled={!selectedClass || students.length === 0 || copyingFromYesterday}
          >
            {copyingFromYesterday ? "Copying…" : "Copy from Yesterday"}
          </AttendanceButton>
          <AttendanceButton
            variant="ghost"
            leftIcon={<Download size={16} />}
            className="w-full"
            onClick={handleExportReport}
            disabled={students.length === 0}
          >
            Export Report
          </AttendanceButton>
        </div>
      </section>

      <section className="rounded-xl sm:rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
        <div className="p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-semibold text-white">Mark Attendance</h3>
          <p className="text-sm text-white/60 mt-1">
            {selectedClassLabel || "No class selected"} -{" "}
            {formatLongDate(selectedDate)}
          </p>
        </div>

        <div className="hidden md:block max-h-[420px] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <InlinePanelTable columns={columns} data={students} rowKey={(row) => row.id} />
        </div>

        <div className="md:hidden px-4 pb-4 space-y-3 max-h-[50vh] overflow-y-auto no-scrollbar">
          {students.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
              No students found
            </div>
          )}
          {students.map((student) => (
            <div
              key={student.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full overflow-hidden border border-white/10">
                  <img
                    src={student.avatar}
                    alt={student.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{student.name}</p>
                  <p className="text-xs text-white/60">Roll: {student.roll}</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-2 flex gap-2">
                <AttendanceButton
                  size="sm"
                  variant={student.status === "present" ? "success" : "ghost"}
                  active={student.status === "present"}
                  leftIcon={<CheckCircle2 size={14} />}
                  className="flex-1 justify-center"
                  onClick={() =>
                    setStudents((prev) =>
                      prev.map((s) =>
                        s.id === student.id ? { ...s, status: "present" } : s
                      )
                    )
                  }
                >
                  Present
                </AttendanceButton>
                <AttendanceButton
                  size="sm"
                  variant={student.status === "absent" ? "danger" : "ghost"}
                  active={student.status === "absent"}
                  leftIcon={<XCircle size={14} />}
                  className="flex-1 justify-center"
                  onClick={() =>
                    setStudents((prev) =>
                      prev.map((s) =>
                        s.id === student.id ? { ...s, status: "absent" } : s
                      )
                    )
                  }
                >
                  Absent
                </AttendanceButton>
                <AttendanceButton
                  size="sm"
                  variant={student.status === "late" ? "warning" : "ghost"}
                  active={student.status === "late"}
                  leftIcon={<Clock size={14} />}
                  className="flex-1 justify-center"
                  onClick={() =>
                    setStudents((prev) =>
                      prev.map((s) =>
                        s.id === student.id ? { ...s, status: "late" } : s
                      )
                    )
                  }
                >
                  Late
                </AttendanceButton>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-white/10 px-6 py-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50">Present</p>
              <p className="text-lg font-semibold text-lime-300">{stats.present}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50">Absent</p>
              <p className="text-lg font-semibold text-red-400">{stats.absent}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50">Late</p>
              <p className="text-lg font-semibold text-amber-300">{stats.late}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/50">Rate</p>
              <p className="text-lg font-semibold text-white">{stats.rate}%</p>
            </div>
          </div>

          <AttendanceButton
            variant="primary"
            className="px-6"
            leftIcon={<Save size={16} />}
            onClick={handleSaveAttendance}
          >
            {savingAttendance ? "Saving..." : "Save Attendance"}
          </AttendanceButton>
        </div>

        <div className="md:hidden border-t border-white/10 px-4 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-lime-300/70">Present</p>
              <p className="text-lg font-semibold text-lime-300">{stats.present}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-red-300/70">Absent</p>
              <p className="text-lg font-semibold text-red-400">{stats.absent}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-amber-300/70">Late</p>
              <p className="text-lg font-semibold text-amber-300">{stats.late}</p>
            </div>
          </div>

          <AttendanceButton
            variant="primary"
            className="w-full justify-center"
            leftIcon={<Save size={16} />}
            onClick={handleSaveAttendance}
          >
            {savingAttendance ? "Saving..." : "Save Attendance"}
          </AttendanceButton>
        </div>
      </section>

      <SuccessPopups
        open={showSuccess}
        title="Attendance Created Successfully"
        description="Attendance saved for the selected class."
        onClose={() => setShowSuccess(false)}
      />
    </div>
  );
}
