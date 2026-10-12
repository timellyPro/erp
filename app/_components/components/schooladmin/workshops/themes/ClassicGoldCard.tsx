"use client";

import { Award } from "lucide-react";
import ThemeCard from "./ThemeCard";

type ThemeProps = {
  selected: boolean;
  onSelect: () => void;
};

export default function ClassicGoldCard({ selected, onSelect }: ThemeProps) {
  return (
    <ThemeCard
      title="Classic Gold"
      description="Traditional layout with gold borders and serif fonts."
      selected={selected}
      onSelect={onSelect}
      preview={<Award size={26} className="text-white/50" />}
      previewClassName="bg-gradient-to-br from-black/80 to-amber-950/40"
      accentClassName="gold"
    />
  );
}
