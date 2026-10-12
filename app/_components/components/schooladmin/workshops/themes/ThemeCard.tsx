"use client";

import { CheckCircle2 } from "lucide-react";
import { ReactNode } from "react";

type ThemeCardProps = {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  preview: ReactNode;
  previewClassName?: string;
  accentClassName?: string;
};

export default function ThemeCard({
  title,
  description,
  selected,
  onSelect,
  preview,
  previewClassName = "",
  accentClassName = "lime",
}: ThemeCardProps) {
  const accent =
    accentClassName === "gold"
      ? {
          border: "border-amber-400/70",
          hover: "hover:border-amber-400/60",
          text: "text-amber-300",
          hoverText: "group-hover:text-amber-300",
          ring: "shadow-[0_0_0_1px_rgba(251,191,36,0.7)]",
        }
      : accentClassName === "spark"
      ? {
          border: "border-fuchsia-400/70",
          hover: "hover:border-fuchsia-400/60",
          text: "text-fuchsia-300",
          hoverText: "group-hover:text-fuchsia-300",
          ring: "shadow-[0_0_0_1px_rgba(232,121,249,0.7)]",
        }
      : {
          border: "border-lime-400/70",
          hover: "hover:border-lime-400/60",
          text: "text-lime-300",
          hoverText: "group-hover:text-lime-300",
          ring: "shadow-[0_0_0_1px_rgba(163,230,53,0.7)]",
        };
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-2xl border text-left transition-all ${
        selected
          ? `${accent.border} ${accent.ring}`
          : `border-white/10 ${accent.hover}`
      } bg-white/5 hover:bg-white/10`}
    >
      <div
        className={`rounded-t-2xl border-b border-white/10 px-4 py-6 flex items-center justify-center text-white/40 ${previewClassName}`}
      >
        {preview}
      </div>
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div
              className={`font-semibold ${
                selected ? accent.text : "text-white"
              } ${accent.hoverText}`}
            >
              {title}
            </div>
            <div className="text-xs text-white/50 mt-1">{description}</div>
          </div>
          {selected && <CheckCircle2 size={18} className={accent.text} />}
        </div>
      </div>
    </button>
  );
}
