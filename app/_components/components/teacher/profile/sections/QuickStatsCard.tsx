"use client";

import { QuickStats } from "../types";

interface QuickStatsCardProps {
  stats: QuickStats;
}

export default function QuickStatsCard({ stats }: QuickStatsCardProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
      <div className="p-5 sm:p-6">
        <h3 className="text-[18px] font-bold text-white">Quick Stats</h3>
      </div>
      <div className="h-px bg-white/10" />

      <div className="px-5 sm:px-6">
        <StatsRow label="Total Classes" value={stats.totalClasses} />
        <StatsRow label="Total Students" value={stats.totalStudents} />
        <StatsRow label="Workshops Conducted" value={stats.workshopsConducted} isLast />
      </div>
    </section>
  );
}

function StatsRow({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: number;
  isLast?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-5 ${isLast ? "" : "border-b border-white/10"}`}>
      <p className="text-[13px] sm:text-[14px] text-white/65">{label}</p>
      <p className="text-[13px] sm:text-[14px] font-semibold text-white">{value}</p>
    </div>
  );
}
