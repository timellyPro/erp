"use client";

import { Award } from "lucide-react";
import ThemeCard from "./ThemeCard";

type ThemeProps = {
  selected: boolean;
  onSelect: () => void;
};

export default function CreativeSparkCard({ selected, onSelect }: ThemeProps) {
  return (
    <ThemeCard
      title="Creative Spark"
      description="Vibrant, colorful shapes for arts and creative events."
      selected={selected}
      onSelect={onSelect}
      preview={<Award size={26} className="text-white/50" />}
      previewClassName="bg-gradient-to-br from-fuchsia-500/30 via-purple-600/30 to-rose-500/30"
      accentClassName="spark"
    />
  );
}
