import { Calendar, Save } from "lucide-react";
import TimellyLoader from "../../../common/TimellyLoader";
import TeacherStatCard from "../../teachersTab/teacherStatCard";
import type { TeacherRow } from "../../teachersTab/TeachersList";
import { ATTENDANCE_STATUSES, todayStr, type AttendanceStatus } from "./teachersTabHelpers";

export function DailyAttendanceCard({
  attendanceDate,
  onAttendanceDateChange,
  overallPct,
  presentCount,
  teachersCount,
  onMarkAllPresent,
  teachersLoading,
  teachers,
  attendanceMap,
  attendanceLoading,
  onTeacherAttendanceChange,
  saveAttendanceLoading,
  onSaveAttendance,
}: {
  attendanceDate: string;
  onAttendanceDateChange: (v: string) => void;
  overallPct: number;
  presentCount: number;
  teachersCount: number;
  onMarkAllPresent: () => void;
  teachersLoading: boolean;
  teachers: TeacherRow[];
  attendanceMap: Record<string, AttendanceStatus>;
  attendanceLoading: boolean;
  onTeacherAttendanceChange: (teacherId: string, status: AttendanceStatus) => void;
  saveAttendanceLoading: boolean;
  onSaveAttendance: () => void;
}) {
  return (
    <div className=" bg-white/4
  backdrop-blur-2xl
  rounded-3xl
  border border-white/10
  shadow-[0_20px_60px_rgba(0,0,0,0.45)]
  overflow-hidden">

      <div className="px-3 sm:px-4 md:p-5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
            <Calendar size={18} />
            Mark Daily Attendance
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {attendanceDate === todayStr() ? "Today" : "Selected date"}: {attendanceDate} • Overall: <span className="text-lime-400 font-semibold">{overallPct}%</span> ({presentCount}/{teachersCount})
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <input
            type="date"
            value={attendanceDate}
            onChange={(e) => onAttendanceDateChange(e.target.value)}
            className="px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-400/50"
          />
          <button
            type="button"
            onClick={onMarkAllPresent}
            className="px-3 py-1.5 bg-lime-400/10 hover:bg-lime-400/20 text-lime-400 border border-lime-400/20 rounded-lg text-xs font-semibold flex items-center gap-2"
          >
            Mark All Present
          </button>
        </div>
      </div>

      <div className="p-4 md:p-5">
        {teachersLoading && teachers.length === 0 ? (
          <TimellyLoader
            compact
            title="Loading teachers"
            steps={["Teacher list", "Attendance", "Roster"]}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teachers.map((t) => {
              const status = attendanceMap[t.id] || "PRESENT";
              return (
                <TeacherStatCard
                  key={t.id}
                  avatar={t.avatar}
                  name={t.name}
                  code={t.teacherId}
                  percentage={status === "PRESENT" || status === "LATE" ? 100 : 0}
                  stats={[
                    { label: "PRES", value: status === "PRESENT" ? 1 : 0, color: "text-lime-400" },
                    { label: "ABS", value: status === "ABSENT" ? 1 : 0, color: "text-red-400" },
                    { label: "LATE", value: status === "LATE" ? 1 : 0, color: "text-sky-400" },
                    { label: "LEAVE", value: status === "ON_LEAVE" ? 1 : 0, color: "text-yellow-400" },
                  ]}
                  statuses={[
                    { label: "P", active: status === "PRESENT" },
                    { label: "A", active: status === "ABSENT" },
                    { label: "L", active: status === "LATE" },
                    { label: "OL", active: status === "ON_LEAVE" },
                  ]}
                  onStatusChange={(label) => {
                    const idx = ["P", "A", "L", "OL"].indexOf(label);
                    if (idx >= 0) onTeacherAttendanceChange(t.id, ATTENDANCE_STATUSES[idx]);
                  }}
                />
              );
            })}
            {attendanceLoading && teachers.length > 0 ? (
              <p className="col-span-full text-xs text-white/40">Updating attendance…</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end pt-4 border-t border-white/5 px-4 pb-4">
        <button
          type="button"
          onClick={onSaveAttendance}
          disabled={saveAttendanceLoading}
          className="px-6 py-2.5 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl shadow-[0_0_15px_rgba(163,230,53,0.3)] flex items-center gap-2 disabled:opacity-60"
        >
          <Save size={18} />
          {saveAttendanceLoading ? "Saving..." : "Save Today's Attendance"}
        </button>
      </div>

    </div>
  );
}
