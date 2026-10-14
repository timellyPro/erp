import { CheckCircle2, Clock, XCircle } from "lucide-react";
import AttendanceButton from "../AttendanceButton";
import type { StudentRow } from "./attendanceHelpers";

export function AttendanceMobileList({
  students,
  setStudents,
}: {
  students: StudentRow[];
  setStudents: (updater: (prev: StudentRow[]) => StudentRow[]) => void;
}) {
  return (
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
  );
}
