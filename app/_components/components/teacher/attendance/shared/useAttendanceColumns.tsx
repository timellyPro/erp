import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Column } from "../../../../types/superadmin";
import AttendanceButton from "../AttendanceButton";
import type { StudentRow } from "./attendanceHelpers";

export function useAttendanceColumns({
  setStudents,
}: {
  setStudents: (updater: (prev: StudentRow[]) => StudentRow[]) => void;
}) {
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

  return { columns };
}
