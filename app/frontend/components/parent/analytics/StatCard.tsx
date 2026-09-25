import React from "react";

const glass = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)]";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tag: string;
}

export default function StatCard({ icon, label, value, sub, tag }: StatCardProps) {
  return (
    <div className={`${glass} rounded-2xl p-4 sm:p-5`}>
      <div className="flex justify-between mb-3">
        <div className="bg-white/10 p-2 rounded-lg">{icon}</div>
        <span className="text-xs text-lime-400 bg-lime-400/10 px-2 py-1 rounded">
          {tag}
        </span>
      </div>
      <div className="text-white/60 text-xs">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/40">{sub}</div>
    </div>
  );
}
