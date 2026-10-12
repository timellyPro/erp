import type { ReactNode } from "react";
import { CalendarDays, CheckCircle, List, Users } from "lucide-react";

function StatTile({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 md:px-5 md:py-4 shadow-lg backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-white/10 flex items-center justify-center text-lime-400">
          {icon}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-white/60">
            {title}
          </div>
          <div className="text-xl sm:text-2xl font-semibold text-white">{value}</div>
        </div>
      </div>
    </div>
  );
}

export function WorkshopsStatTiles({
  stats,
}: {
  stats: { total: number; upcoming: number; participants: number; completed: number };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <StatTile title="TOTAL" value={`${stats.total}`} icon={<List size={24} />} />
      <StatTile title="UPCOMING" value={`${stats.upcoming}`} icon={<CalendarDays size={24} />} />
      <StatTile title="PARTICIPANTS" value={`${stats.participants}`} icon={<Users size={24} />} />
      <StatTile title="COMPLETED" value={`${stats.completed}`} icon={<CheckCircle size={24} />} />
    </div>
  );
}
