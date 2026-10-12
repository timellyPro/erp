"use client";

import { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  primary?: boolean;
}

export default function HeaderActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
}: Props) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center justify-center gap-2
        h-10 px-4
        rounded-xl text-sm font-semibold
        transition
        flex-1 sm:flex-none cursor-pointer
        ${primary
          ? "bg-lime-400 text-black shadow-[0_6px_18px_rgba(163,230,53,0.35)] hover:bg-lime-300"
          : "border border-white/10 bg-white/10 text-white/80 hover:bg-white/20"}
      `}
    >
      <Icon size={16} />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
