"use client";

import { BookOpen } from "lucide-react";
import type { HomeworkItem } from "./types";
import HomeworkCard from "./HomeworkCard";

type Props = {
  homeworks: HomeworkItem[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onEdit: (h: HomeworkItem) => void;
  onDelete: (id: string) => void;
  onViewSubmissions?: (id: string) => void;
};


export default function HomeworkList({
  homeworks,
  expandedId,
  onToggle,
  onEdit,
  onDelete,
  onViewSubmissions,
}: Props) {
  if (homeworks.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-12 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
          <BookOpen className="text-white/20" size={32} />
        </div>
        <h3 className="text-lg font-medium text-white/60">No assignments found</h3>
        <p className="text-sm text-white/40">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {homeworks.map((h) => (
        <HomeworkCard
          key={h.id}
          homework={h}
          isExpanded={expandedId === h.id}
          onToggle={() => onToggle(h.id)}
          onEdit={() => onEdit(h)}
          onDelete={() => onDelete(h.id)}
          onViewSubmissions={onViewSubmissions ? () => onViewSubmissions(h.id) : undefined}
        />
      ))}
    </div>
  );
}
