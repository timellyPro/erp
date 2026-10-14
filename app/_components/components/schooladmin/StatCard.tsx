import { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  iconClassName?: string;
  label: string;
  value: string | number;
}

export default function StatCard({ icon, iconClassName, label, value }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 ${iconClassName ?? "text-lime-300"}`}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-white/60">{label}</div>
        <div className="text-lg font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}