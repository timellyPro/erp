"use client";

import { ReactNode } from "react";

type AttendanceButtonVariant =
  | "neutral"
  | "primary"
  | "success"
  | "danger"
  | "warning"
  | "ghost";

interface AttendanceButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: AttendanceButtonVariant;
  size?: "sm" | "md";
  active?: boolean;
  leftIcon?: ReactNode;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

const VARIANT_CLASSES: Record<AttendanceButtonVariant, string> = {
  neutral:
    "bg-white/10 border-white/0 text-white/80 hover:bg-white/20 hover:border-white/20",
  primary:
    "bg-lime-400/10 border-lime-400/30 text-lime-300 hover:bg-lime-400/20 hover:border-lime-400/50",
  success:
    "bg-lime-400 text-black border-lime-300 hover:bg-lime-300",
  danger:
    "bg-red-500 text-white border-red-400 hover:bg-red-400",
  warning:
    "bg-amber-400 text-black border-amber-300 hover:bg-amber-300",
  ghost:
    "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20",
};

const SIZE_CLASSES = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-5 text-sm",
};

export default function AttendanceButton({
  children,
  onClick,
  className = "",
  variant = "ghost",
  size = "md",
  active = false,
  leftIcon,
  type = "button",
  disabled = false,
}: AttendanceButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-2 rounded-xl border",
        "font-semibold transition-all duration-200",
        "select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        disabled ? "" : "hover:shadow-[0_0_14px_rgba(255,255,255,0.12)] hover:brightness-110",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        active ? "shadow-[0_0_16px_rgba(255,255,255,0.2)]" : "",
        className,
      ].join(" ")}
    >
      {leftIcon ? <span className="flex items-center">{leftIcon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
