"use client";

import { Award } from "lucide-react";
import ThemeCard from "./ThemeCard";

type ThemeProps = {
  selected: boolean;
  onSelect: () => void;
};

export default function TimellyModernCard({ selected, onSelect }: ThemeProps) {
  return (
    <ThemeCard
      title="Timelly Modern"
      description="Clean, emerald green accents, sans-serif typography."
      selected={selected}
      onSelect={onSelect}
      preview={<Award size={26} className="text-white/50" />}
      previewClassName="bg-gradient-to-br from-slate-900/80 to-slate-800/60"
      accentClassName="lime"
    />
  );
}
