

"use client";
import { motion } from "framer-motion";

interface TeacherStatCardProps {
  avatar: string; name: string; code: string; percentage: number;
 stats: { label: string; value: number; color: string }[];
  statuses: { label: string; active?: boolean }[];

  onStatusChange?: (label: string) => void;
}

export default function TeacherStatCard({ avatar, name, code, percentage, stats, statuses, onStatusChange }: TeacherStatCardProps) {
  return (
    <motion.div whileHover={{ y: -4 }} className="bg-[#0F172A]/40 rounded-2xl border border-white/10 flex flex-col overflow-hidden hover:border-lime-400/30 transition-all">
      <div className="p-4 flex items-center justify-between gap-3 bg-white/[0.03]">
        <div className="flex items-center gap-3 min-w-0">
          <img src={avatar} className="w-11 h-11 rounded-full object-cover ring-2 ring-white/10" alt={name} />
          <div className="truncate">
            <p className="text-white font-bold text-sm truncate">{name}</p>
            <p className="text-white/40 text-[10px] uppercase tracking-tighter">{code}</p>
          </div>
        </div>
        <div className="shrink-0 bg-lime-400 text-black text-[10px] font-black px-2 py-1 rounded-md">{percentage}%</div>
      </div>

      <div className="grid grid-cols-4 gap-1 p-3 bg-black/20 border-b border-white/5">
        {stats.map((s, i) => (
          <div key={i} className="text-center">
            <p className={`text-sm font-bold ${s.color || "text-white"}`}>{s.value}</p>
            <p className="text-[10px] text-white/30 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="p-3 grid grid-cols-4 gap-2">
        {statuses.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onStatusChange?.(s.label)}
            className={`h-9 rounded-xl text-xs font-bold transition-all ${
              s.active ? "bg-lime-400 text-black shadow-[0_0_15px_rgba(163,230,53,0.3)]" : "bg-white/5 text-white/30 hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}