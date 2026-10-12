"use client";

import { LucideChartColumn, LucideStar, LucideIcon } from "lucide-react";
import ProgressBar from "./ProgressBar";

interface GradeScale {
  label: string;
  range: string;
  color?: string;
}

interface StatItem {
  title?: string;
  value?: string | number;
  icon?: LucideIcon; // ✅ Changed to LucideIcon
}

interface StudentPerformanceCardProps {
  name: string;
  grade: string | number;
  imageUrl: string;
  score: number;
  classAverage: number;
  attendance: number;
  stats?: StatItem[];
  gradingScale?: GradeScale[];
}

export default function StudentPerformanceCard({
  name,
  grade,
  imageUrl,
  score,
  classAverage,
  attendance,
  stats = [],
  gradingScale = [],
}: StudentPerformanceCardProps) {
  return (
    <div className="space-y-4 relative z-10">
      <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.05] overflow-hidden">

        {/* ================= PROFILE ================= */}
        <div>
          <div className="w-full aspect-square rounded-2xl overflow-hidden mb-4 border border-white/[0.1] bg-white/5">
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.includes('ui-avatars.com')) {
                  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=200&background=4ade80&color=fff`;
                }
              }}
            />
          </div>

          <div className="text-center mb-4">
            <h4 className="font-bold text-white text-lg">{name}</h4>
            <p className="text-sm text-gray-400">{grade}</p>
          </div>
        </div>

        {/* ================= PERFORMANCE ================= */}
        <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.05]">
          <h4 className="font-bold text-white mb-4 flex items-center gap-2">
            <LucideChartColumn className="w-5 h-5 text-[#A3E635]" />
            Performance Stats
          </h4>

          <div className="space-y-3">
            <ProgressBar
              label="Your Score"
              value={score}
              color="bg-[#A3E635]"
              textColor="text-[#A3E635]"
            />

            <ProgressBar
              label="Class Average"
              value={classAverage}
              color="bg-blue-400"
              textColor="text-blue-400"
            />

            <ProgressBar
              label="Attendance"
              value={attendance}
              color="bg-yellow-400"
              textColor="text-yellow-400"
            />

            {/* ================= STAT CARDS ================= */}
            {stats.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {stats.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={index}
                      className="
                        rounded-2xl
                        bg-gradient-to-br from-[#5B3C3C]/70 to-[#6E4A4A]/60
                        backdrop-blur-xl
                        border border-white/10
                        py-4 px-3
                        flex flex-col items-center justify-center
                        text-center
                        transition-all duration-300
                        hover:scale-[1.03]
                      "
                    >
                      {Icon && (
                        <div className="mb-2 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-[#A3E635]" />
                        </div>
                      )}

                      <h2 className="text-2xl font-bold text-white">
                        {item.value}
                      </h2>

                      <p className="text-sm text-gray-300 mt-1">
                        {item.title}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ================= GRADING SCALE ================= */}
        {gradingScale.length > 0 && (
          <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.05] mt-4">
            <h4 className="font-bold text-white mb-3 flex items-center gap-2">
              <LucideStar className="w-5 h-5 text-gray-300" />
              Grading Scale
            </h4>

            <div className="space-y-2 text-xs">
              {gradingScale.map((gradeItem, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg border border-white/[0.05]"
                >
                  <span className="font-medium text-gray-400">
                    {gradeItem.label}
                  </span>

                  <span
                    className={`font-bold ${
                      gradeItem.color || "text-[#A3E635]"
                    }`}
                  >
                    {gradeItem.range}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
