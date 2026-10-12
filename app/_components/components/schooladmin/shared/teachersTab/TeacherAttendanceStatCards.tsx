import { Coffee, Clock, UserCheck, XCircle } from "lucide-react";
import StatCard from "../../../common/statCard";

export function TeacherAttendanceStatCards({
  presentCount,
  teachersCount,
  onLeaveCount,
  lateCount,
  absentCount,
}: {
  presentCount: number;
  teachersCount: number;
  onLeaveCount: number;
  lateCount: number;
  absentCount: number;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <StatCard
        title="Total Present"
        value={<>{presentCount} <span className="text-sm text-lime-400">/ {teachersCount}</span></>}
        icon={<UserCheck size={70} className="text-white/30" />}
        iconVariant="plain"
      />
      <StatCard
        title="On Leave"
        value={<>{onLeaveCount} <span className="text-yellow-400 text-sm">Teacher{onLeaveCount !== 1 ? "s" : ""}</span></>}
        icon={<Coffee size={70} className="text-white/30" />}
        iconVariant="plain"
      />
      <StatCard
        title="Late Arrival"
        value={<>{lateCount} <span className="text-sky-400 text-sm">Teacher{lateCount !== 1 ? "s" : ""}</span></>}
        icon={<Clock size={70} className="text-white/30" />}
        iconVariant="plain"
      />
      <StatCard
        title="Absent"
        value={<>{absentCount} <span className="text-red-400 text-sm">Unplanned</span></>}
        icon={<XCircle size={70} className="text-white/30" />}
        iconVariant="plain"
      />
    </div>
  );
}
