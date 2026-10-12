import type { LucideIcon } from "lucide-react";

export function IconTab({
  label,
  count,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 text-xs sm:text-sm ${active
        ? "bg-white/5 text-lime-400 border-b-2 border-lime-400"
        : "text-gray-400 hover:text-white"
        }`}
    >
      <Icon size={16} />
      <span>
        {label} <span className="hidden sm:inline">({count})</span>
        <span className="sm:hidden">({count})</span>
      </span>
    </button>
  );
}
