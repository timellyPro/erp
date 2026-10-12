import type { LucideIcon } from "lucide-react";

export function ActionButton({
  label,
  icon: Icon,
  color,
  onClick,
  full,
  disabled,
}: {
  label?: string;
  icon: LucideIcon;
  color: "green" | "yellow" | "red";
  onClick: () => void;
  full?: boolean;
  disabled?: boolean;
}) {
  const colorMap: Record<string, string> = {
    green: "border-lime-400 text-black bg-lime-400",
    yellow: "border-yellow-400 text-black bg-yellow-400",
    red: "border-red-500 text-white bg-red-500",
  };
  const mobileColorMap: Record<string, string> = {
    green: "border-lime-400  text-lime-400 bg-lime-400/10",
    yellow: "border-yellow-400 text-yellow-400 bg-yellow-400/10",
    red: "border-red-500 text-red-500 bg-red-500/10",
  };

  // ICON-ONLY (desktop table)
  if (!label) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`p-2 rounded-xl border ${colorMap[color]} transition disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Icon size={16} />
      </button>
    );
  }

  // FULL BUTTON (mobile cards)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
    inline-flex items-center gap-2 flex-col
    px-1 py-2 text-xs font-semibold
    border ${mobileColorMap[color]}
    ${full ? "w-full justify-center rounded-xl" : "rounded-full"}
    transition
    disabled:opacity-50 disabled:cursor-not-allowed
  `}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}
