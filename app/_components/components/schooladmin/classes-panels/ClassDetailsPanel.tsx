"use client";

import { Eye, X } from "lucide-react";

type ClassRow = {
  id: string;
  name: string;
  section: string;
  students: number;
  teacher: string;
  subject: string;
};

interface ClassDetailsPanelProps {
  row: ClassRow;
  onClose: () => void;
}

export default function ClassDetailsPanel({
  row,
  onClose,
}: ClassDetailsPanelProps) {
  const shortSection = row.section.replace("Section ", "");

  return (
    <div className="bg-[#0F172A] p-4 shadow-inner animate-fadeIn border-y border-white/10">
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 border border-white/10">
              <Eye size={16} className="text-white/80" />
            </span>
            <h3 className="text-base sm:text-lg font-semibold">
              Class Details: {row.name} - {shortSection}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close class details"
          >
            <X size={16} className="mx-auto" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/50">
              Class Teacher
            </div>
            <div className="text-sm font-bold text-lime-400 mt-1">{row.teacher}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/50">
              Total Students
            </div>
            <div className="mt-1 text-white font-semibold text-sm">{row.students}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/50">
              Subject Focus
            </div>
            <div className="mt-1 text-white font-semibold text-sm">{row.subject}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/50">
              Performance
            </div>
            <div className="mt-1 text-white font-semibold text-sm">Top 10%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
