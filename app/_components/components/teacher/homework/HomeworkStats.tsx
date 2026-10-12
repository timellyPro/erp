"use client";

import { BookOpen, CheckCircle2, TrendingUp } from "lucide-react";

type Props = {
  activeCount: number;
  totalSubmissions: number;
  avgCompletionPercent: number;
};

export default function HomeworkStats({
  activeCount,
  totalSubmissions,
  avgCompletionPercent,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-6 flex flex-row sm:flex-col items-center sm:items-start gap-4 sm:gap-0">
        <BookOpen className="text-lime-400 mb-0 sm:mb-2 shrink-0" />
        <div>
          <p className="text-white/60 text-xs md:text-sm">Active Assignments</p>
          <p className="text-2xl md:text-3xl font-bold">{activeCount}</p>
        </div>
      </div>
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-6 flex flex-row sm:flex-col items-center sm:items-start gap-4 sm:gap-0">
        <CheckCircle2 className="text-blue-400 mb-0 sm:mb-2 shrink-0" />
        <div>
          <p className="text-white/60 text-xs md:text-sm">Total Submissions</p>
          <p className="text-2xl md:text-3xl font-bold">{totalSubmissions}</p>
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-6 flex flex-row sm:flex-col items-center sm:items-start gap-4 sm:gap-0 sm:col-span-2 lg:col-span-1">
        <TrendingUp className="text-purple-400 mb-0 sm:mb-2 shrink-0" />
        <div>
          <p className="text-white/60 text-xs md:text-sm">Avg. Completion Rate</p>
          <p className="text-2xl md:text-3xl font-bold">{avgCompletionPercent}%</p>
        </div>
      </div>
    </div>
  );
}
