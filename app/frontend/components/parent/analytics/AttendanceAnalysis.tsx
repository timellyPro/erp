import { CheckCircle2, Clock } from "lucide-react";

const glass = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)]";

interface AttendanceAnalysisProps {
  percent: number;
  present: number;
  absent: number;
  late: number;
  change: string;
}

export default function AttendanceAnalysis({
  percent,
  present,
  absent,
  late,
  change,
}: AttendanceAnalysisProps) {
  const stats = [
    { label: "Present Days", value: present.toString(), percent: `${percent.toFixed(1)}%`, icon: <CheckCircle2 size={16} className="text-green-400" /> },
    { label: "Absent Days", value: absent.toString(), percent: `${absent > 0 ? ((absent / (present + absent)) * 100).toFixed(1) : 0}%`, icon: <Clock size={16} className="text-red-400" />, isNegative: true },
    { label: "Late Arrivals", value: late.toString(), percent: `${late > 0 ? ((late / (present + absent + late)) * 100).toFixed(1) : 0}%`, icon: <Clock size={16} className="text-orange-400" /> },
  ];

  return (
    <div className={`${glass} rounded-3xl p-4 sm:p-6`}>
      <h3 className="text-lg font-semibold mb-1">Attendance Analysis</h3>
      <p className="text-white/50 text-sm mb-8">Monthly attendance breakdown</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Circular Progress */}
        <div className="flex justify-center relative">
          <div
            className="relative w-48 h-48 rounded-full flex items-center justify-center"
            style={{
              background: `conic-gradient(#a3e635 0% ${percent}%, rgba(255,255,255,0.1) ${percent}% 100%)`,
              maskImage: 'radial-gradient(transparent 55%, black 56%)',
              WebkitMaskImage: 'radial-gradient(transparent 55%, black 56%)',
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold">{percent.toFixed(1)}%</span>
            <span className="text-xs text-white/60">Present</span>
            <span className="text-[10px] text-lime-400 mt-1">↗ {change}</span>
          </div>
        </div>

        {/* Breakdown List */}
        <div className="space-y-3">
          {stats.map((item, idx) => (
            <div key={idx} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/5 p-2 rounded-lg">{item.icon}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold">{item.value}</span>
                    <span className="text-xs text-white/40">{item.label}</span>
                  </div>
                </div>
              </div>
              <span className={`text-lg font-bold ${item.isNegative ? 'text-red-400' : 'text-white'}`}>
                {item.percent}
              </span>
            </div>
          ))}

          {/* Bottom Trend */}
          <div className="bg-lime-400/10 border border-lime-400/20 rounded-2xl p-2 text-center">
            <span className="text-lime-400 text-xs font-semibold">↗ {change} from last month</span>
          </div>
        </div>
      </div>
    </div>
  );
}
