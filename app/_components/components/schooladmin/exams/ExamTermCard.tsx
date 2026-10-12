"use client";

import { BookOpen, Calendar, LucideSquarePen } from "lucide-react";
import type { ExamTermListItem } from "@/app/_components/hooks/useExamTerms";
import {
  EXAM_ACCENT,
  EXAM_UPCOMING_LABEL_BG,
  EXAM_COMPLETED_LABEL_BG,
  EXAM_TEXT_MAIN,
  EXAM_TEXT_SECONDARY,
} from "@/app/_components/constants/colors";

interface ExamTermCardProps {
  term: ExamTermListItem;
  isSelected: boolean;
  onClick: () => void;
  onEdit?: (term: ExamTermListItem) => void;
}

export default function ExamTermCard({ term, isSelected, onClick, onEdit }: ExamTermCardProps) {
  const isUpcoming = term.status === "UPCOMING";
  const classLabel = term.class?.name
    ? [term.class.name, term.class.section].filter(Boolean).join(" ")
    : "-";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative flex h-[230px] w-full flex-col overflow-hidden rounded-2xl border p-5 text-left transition-all ${
        isSelected
          ? "bg-white/10 border-lime-400/50 shadow-xl"
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
      }`}
      aria-pressed={isSelected}
    >
      <span
        className="absolute left-0 top-0 h-full w-1"
        style={{
          background: isSelected ? EXAM_ACCENT : "transparent",
          boxShadow: isSelected ? `0 0 10px ${EXAM_ACCENT}` : "none",
        }}
      />

      <div className="mb-4 flex items-start justify-between gap-3">
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-lime-400/20 text-lime-400"
          style={{
            background: isUpcoming ? EXAM_UPCOMING_LABEL_BG : EXAM_COMPLETED_LABEL_BG,
            color: isUpcoming ? EXAM_ACCENT : "#B4B4B4",
          }}
        >
          {isUpcoming ? "Upcoming" : "Completed"}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(term);
          }}
          className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"
          aria-label={`Edit ${term.name}`}
        >
          <LucideSquarePen className="h-4 w-4" style={{ color: EXAM_TEXT_SECONDARY }} />
        </button>
      </div>

      <h3 className="font-bold text-lg mb-1 text-gray-300 line-clamp-1" style={{ color: EXAM_TEXT_MAIN }}>
        {term.name}
      </h3>

      <p
        className="text-xs text-gray-500 mb-4 overflow-hidden"
        style={{ color: EXAM_TEXT_SECONDARY, minHeight: "2.5rem", maxHeight: "2.5rem" }}
      >
        {term.description || "No description added yet."}
      </p>

      <div className="mt-auto flex items-center gap-4 text-xs text-gray-400 border-t border-white/5 pt-3" style={{ color: EXAM_TEXT_SECONDARY }}>
        <span className="flex items-center gap-1.5">
          <BookOpen size={15} />
          {term._count?.syllabus ?? 0} Subjects
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar size={15} />
          {classLabel}
        </span>
      </div>
    </div>
  );
}
