import { CheckCircle2, Clock, Users, XCircle } from "lucide-react";
import StatCard from "../../../common/statCard";

export function AttendanceStatCards({
  stats,
}: {
  stats: { present: number; absent: number; late: number; total: number };
}) {
  return (
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
  );
}
