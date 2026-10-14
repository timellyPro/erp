import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { TrendingUp, Users, CalendarCheck, BookOpen, Award } from "lucide-react";

type Stat = {
  icon: React.ComponentType<{ className?: string }>;
  iconBorder: string;
  iconBg: string;
  iconColor: string;
  title: string;
  value: string | number;
  change: string;
  changeColor: string;
};

type Teacher = { id: string; name: string; subject: string; rating: number };

export function AnalysisOverviewSection({
  shellLoading,
  stats,
  axisStyle,
  feesData,
  enrollmentData,
  attendanceData,
  subjectData,
  topTeachers,
  selectedYear,
}: {
  shellLoading: boolean;
  stats: Stat[];
  axisStyle: Record<string, unknown>;
  feesData: Array<{ month: string; value: number }>;
  enrollmentData: Array<{ year: string | number; students: number }>;
  attendanceData: Array<{ day: string; students: number; teachers: number }>;
  subjectData: Array<{ subject: string; score: number }>;
  topTeachers: Teacher[];
  selectedYear: number;
}) {
  return (
    <>
      {/* Stats - responsive grid */}
      <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6 ${shellLoading ? "animate-pulse" : ""}`}>
        {stats.map((stat, i) => (
          <div
            key={i}
            className="rounded-xl sm:rounded-2xl p-3 sm:p-5 bg-white/10 backdrop-blur-md border border-white/10 flex flex-col justify-between min-h-[100px] sm:min-h-0"
          >
            <div className="flex items-start gap-2 sm:gap-4">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center border shrink-0 ${stat.iconBorder} ${stat.iconBg}`}
              >
                <stat.icon
                  className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.iconColor}`}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-[10px] sm:text-xs text-white/70 leading-tight truncate">
                  {stat.title}
                </p>
                <h2
                  className={`text-lg sm:text-2xl font-bold truncate ${stat.changeColor}`}
                >
                  {stat.value}
                </h2>
              </div>
            </div>
            <p
              className={`text-[10px] sm:text-xs mt-2 sm:mt-3 ml-0 sm:ml-2 ${stat.changeColor} truncate`}
            >
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-white/10 backdrop-blur-md min-h-[280px] sm:min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-lime-400 shrink-0" />
            <h3 className="font-semibold text-white text-xs sm:text-sm">
              Monthly Fees Collection
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={feesData}>
              <defs>
                <linearGradient id="fees" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a3e635" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#a3e635" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
              />
              <YAxis {...axisStyle} tickLine={false} axisLine={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#a3e635"
                fill="url(#fees)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-white/10 backdrop-blur-md min-h-[280px] sm:min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
            <h3 className="font-semibold text-white text-xs sm:text-sm">
              Student Enrollment Growth
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={enrollmentData} barCategoryGap="35%">
              <XAxis
                dataKey="year"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
              />
              <YAxis {...axisStyle} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="students" fill="#60a5fa" barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-white/10 backdrop-blur-md min-h-[280px] sm:min-h-[320px]">
          <div className="flex items-center gap-2 mb-4">
            <CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
            <h3 className="font-semibold text-white text-xs sm:text-sm">
              Attendance: Students vs Teachers
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={attendanceData}>
              <XAxis
                dataKey="day"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                {...axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip formatter={(value) => `${value}%`} />
              <Line
                type="monotone"
                dataKey="students"
                stroke="#60a5fa"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="teachers"
                stroke="#a3e635"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 bg-white/10 backdrop-blur-md min-h-[280px] sm:min-h-[320px]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 bg-dark-400 shrink-0" />
              <h3 className="font-semibold text-white text-xs sm:text-sm">
                Subject Performance
              </h3>
            </div>
            <span className="text-[10px] sm:text-xs text-white/50 border border-white/10 rounded-lg px-2 py-1">
              All Exams
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={subjectData} layout="vertical">
              <XAxis
                type="number"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="subject"
                type="category"
                {...axisStyle}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip />
              <Bar dataKey="score" fill="#facc15" barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Performing Teachers - sorted best first */}
      <div className="mt-4 sm:mt-6 rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white/10 backdrop-blur-md border border-white/10">
        <div className="mb-4 sm:mb-5">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 sm:w-5 sm:h-5 text-purple-300 shrink-0" />
            <h3 className="font-semibold text-white text-sm sm:text-base">
              Top Performing Teachers
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-white/50 mt-1">
            By student exam performance ({selectedYear}-
            {selectedYear + 1}), best first
          </p>
        </div>

        <div className="border-t border-white/10 mb-4 sm:mb-5" />

        {topTeachers.length === 0 ? (
          <p className="text-sm text-white/50 py-4">
            No teacher performance data for this year yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {topTeachers.map((t) => (
              <div
                key={t.id}
                className="rounded-lg sm:rounded-xl p-4 sm:p-6 bg-white/5 border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full uppercase bg-purple-400/20 flex items-center justify-center text-purple-300 shrink-0 text-sm sm:text-base">
                    {t.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-semibold text-white truncate">
                      {t.name}
                    </p>
                    <p className="text-[10px] sm:text-xs text-white/30 truncate">
                      {t.subject}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lime-400 font-bold text-sm sm:text-base">
                    {t.rating.toFixed(1)}
                  </p>
                  <p className="text-[10px] text-white/40">Rating</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
