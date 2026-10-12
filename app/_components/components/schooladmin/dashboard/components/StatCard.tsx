import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  trend: string;
  trendColor?: string;
  Icon: LucideIcon;
}

export const StatCard = ({ label, value, trend, trendColor = "text-lime-400", Icon }: StatCardProps) => (
  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 sm:p-4 md:p-4 flex-1 min-w-0">
    <div className="p-2 sm:p-2.5 bg-white/5 w-fit rounded-xl mb-2 sm:mb-3">
      <Icon className="w-5 h-5 text-lime-400" />
    </div>
    <p className="text-gray-400 text-[10px] sm:text-xs font-medium uppercase tracking-wider truncate">{label}</p>
    <h3 className="text-lg sm:text-xl md:text-2xl font-bold mt-0.5 sm:mt-1 mb-1 sm:mb-1.5 text-white truncate">{value}</h3>
    <p className={`${trendColor} text-[9px] sm:text-[10px] font-bold tracking-widest uppercase truncate`}>
      {trend}
    </p>
  </div>
);