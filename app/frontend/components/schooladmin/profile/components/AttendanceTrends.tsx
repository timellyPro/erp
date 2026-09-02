import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Calendar } from "lucide-react";

type Props = {
  data?: Array<{ month: string; present: number; total: number; pct: number }>;
};

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

export const AttendanceTrends = ({ data = [] }: Props) => {
  const activeData = data.length > 0 ? data : [];

  const chartData = activeData.map((d) => {
    // Splits "2024-01" into ["2024", "01"]
    const [, month] = d.month.split("-");
    return {
      ...d,
      monthLabel: MONTH_LABELS[month] ?? month,
    };
  });

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 overflow-hidden min-w-0">
      <h3 className="text-white text-base sm:text-lg font-semibold flex items-center gap-2 mb-4 sm:mb-8">
        <Calendar className="w-5 h-5 text-blue-400 flex-shrink-0" /> Attendance Trends
      </h3>
      <div className="h-52 sm:h-48 w-full min-h-[200px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: -8, right: 4, bottom: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis 
                dataKey="monthLabel" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#9ca3af", fontSize: 12 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "#9ca3af", fontSize: 12 }} 
                domain={[0, 24]}
                ticks={[0, 6, 12, 18, 24]}
              />
              <Tooltip
                contentStyle={{ background: "#2d243a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff" }}
                itemStyle={{ color: "#3b82f6" }}
              />
              <Line 
                type="monotone" 
                dataKey="present" 
                stroke="#3b82f6" 
                strokeWidth={3} 
                dot={{ fill: "#3b82f6", r: 4, strokeWidth: 2 }} 
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No attendance data
          </div>
        )}
      </div>
    </div>
  );
};