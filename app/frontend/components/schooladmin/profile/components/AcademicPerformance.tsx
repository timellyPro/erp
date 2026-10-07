import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";
import SelectInput from "../../../common/SelectInput";
import type { ReactNode } from "react";

type Props = {
  data?: Array<{ subject: string; score: number }>;
  rightAction?: ReactNode;
};

export const AcademicPerformance = ({ data = [], rightAction }: Props) => {
  const chartData = data.length > 0 ? data : [];

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[32px] p-4 sm:p-8 w-full min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 mb-6 sm:mb-10 min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-white text-lg sm:text-2xl font-bold flex items-center gap-2 sm:gap-3 min-w-0">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-[#b4f44d] flex-shrink-0" />
            <span className="leading-tight">Academic Performance</span>
          </h3>
          {rightAction ? <div className="w-full sm:w-auto">{rightAction}</div> : null}
        </div>

        <div className="w-full sm:w-auto sm:min-w-[140px] min-w-0 sm:max-w-[180px]">
          <SelectInput
            value="Midterm"
            options={[{ label: "Midterm", value: "Midterm" }]}
            bgColor="black"
          />
        </div>
      </div>

      <div className="h-64 w-full min-h-[200px]">
        {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 4, left: -12, bottom: 8 }}>
            <CartesianGrid 
              vertical={false} 
              strokeDasharray="3 3" 
              stroke="rgba(255,255,255,0.1)" 
            />
            <XAxis
              dataKey="subject"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: "#9ca3af", fontSize: 14 }} 
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Bar
              dataKey="score"
              fill="#b4f44d"
              radius={[6, 6, 0, 0]}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">No academic data</div>
        )}
      </div>
    </div>
  );
};
