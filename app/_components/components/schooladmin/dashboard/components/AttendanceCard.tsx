type Props = {
  present?: number;
  absent?: number;
  late?: number;
  total?: number;
  overallRate?: number;
  presentPct?: string;
  absentPct?: string;
  latePct?: string;
};
export const AttendanceCard = ({
  present = 0,
  absent = 0,
  late = 0,
  total = 0,
  overallRate = 0,
  presentPct = "0",
  absentPct = "0",
  latePct = "0",
}: Props) => {
  const stats = [
    { label: "Present", value: present.toLocaleString(), color: "text-lime-400", pct: `${presentPct}%` },
    { label: "Absent", value: absent.toLocaleString(), color: "text-rose-400", pct: `${absentPct}%` },
    { label: "Late", value: late.toLocaleString(), color: "text-amber-400", pct: `${latePct}%` },
    { label: "Total", value: total.toLocaleString(), color: "text-white/90", pct: "100%" },
  ];

  return (
    <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-4 sm:p-6 md:p-8 flex-grow">
      <div className="mb-4 sm:mb-6 md:mb-8">
        <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Students Attendance Overview</h3>
        <p className="text-gray-400 text-xs sm:text-sm mt-0.5 sm:mt-1">Today&apos;s attendance summary</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8 md:mb-10">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white/5 border border-white/5 rounded-xl md:rounded-[20px] py-4 sm:py-5 md:py-6 px-3 sm:px-4 text-center">
            <h4 className={`text-2xl sm:text-3xl md:text-4xl font-bold ${stat.color}`}>{stat.value}</h4>
            <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-bold mt-1 sm:mt-2 tracking-widest">{stat.label}</p>
            <p className={`text-[10px] sm:text-[11px] font-bold mt-0.5 sm:mt-1 ${stat.color} opacity-80`}>{stat.pct}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 sm:space-y-4">
        <div className="flex justify-between items-end gap-2">
          <span className="text-xs sm:text-sm font-semibold text-gray-300">Overall Attendance Rate</span>
          <span className="text-lime-400 font-bold text-base sm:text-lg flex-shrink-0">{overallRate}%</span>
        </div>
        <div className="w-full bg-white/10 h-2 sm:h-3 rounded-full relative overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-lime-400 rounded-full shadow-[0_0_12px_#a3e635]"
            style={{ width: `${Math.min(100, overallRate)}%` }}
          />
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium text-gray-500">
          <span className="text-lime-400 text-sm">↑</span>
          <span className="uppercase tracking-wider">+2.3% from last week</span>
        </div>
      </div>
    </div>
  );
};