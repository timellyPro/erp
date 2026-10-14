"use client";

import { PRIMARY_COLOR } from "../../constants/colors";

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
  color?:string;
}

export default function Spinner({ size = 28, className = "", label, color= `${PRIMARY_COLOR}`}: SpinnerProps) {
  const s = `${size}px`;
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`} role="status" aria-live="polite">
      <div
        className="rounded-full border-4 border-t-transparent animate-spin"
        style={{ width: s, height: s, borderColor: "rgba(255,255,255,0.15)", borderTopColor: `${color}` }}
      />
      {label && <span className="text-white/70 text-sm">{label}</span>}
    </div>
  );
}
