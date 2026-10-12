"use client";

import { Search, Calendar, FileText, Plus, GraduationCap } from "lucide-react";

function getCurrentAcademicYearStart(): number {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

function makeAcademicYears(startYear = getCurrentAcademicYearStart()) {
  return Array.from({ length: 4 }, (_, index) => {
    const year = startYear - index;
    const value = `${year}-${year + 1}`;
    return { value, label: value };
  });
}

const DEFAULT_ACADEMIC_YEARS = makeAcademicYears();

function getNextAcademicYear(currentYears: { value: string }[]): string {
  let maxStart = getCurrentAcademicYearStart();
  for (const y of currentYears) {
    const m = y.value.match(/^(\d{4})-(\d{4})$/);
    if (m) maxStart = Math.max(maxStart, parseInt(m[1], 10));
  }
  return `${maxStart + 1}-${maxStart + 2}`;
}

interface TeacherAuditHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  academicYear: string;
  onAcademicYearChange: (value: string) => void;
  academicYears: { value: string; label: string }[];
  onAddAcademicYear?: (newYear: string) => void;
  recordCount: number;
  onSearchSubmit?: () => void;
  placeholder?: string;
}

export default function TeacherAuditHeader({
  searchValue,
  onSearchChange,
  academicYear,
  onAcademicYearChange,
  academicYears,
  onAddAcademicYear,
  recordCount,
  onSearchSubmit,
  placeholder = "Search teacher...",
}: TeacherAuditHeaderProps) {
  const years = academicYears.length > 0 ? academicYears : DEFAULT_ACADEMIC_YEARS;

  const handleNewYear = () => {
    const nextYear = getNextAcademicYear(years);
    if (!years.some((y) => y.value === nextYear)) {
      onAddAcademicYear?.(nextYear);
    }
    onAcademicYearChange(nextYear);
  };
  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden mb-8">
      {/* Top row: Title + Search */}
      <div className="p-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-[28px] font-bold text-white flex items-center gap-3">
            <span className="text-[#b4ff39] flex items-center shrink-0">
              <GraduationCap className="w-7 h-7 md:w-8 md:h-8" strokeWidth={2} />
            </span>
            <span>Teacher Audit & Appraisal</span>
          </h1>
          <p className="text-sm md:text-base text-white/60 mt-1.5 ml-10 md:ml-11">
            Track performance, acknowledge achievements, and identify areas for improvement.
          </p>
        </div>
        <div className="relative w-full md:w-72 shrink-0">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 w-4 h-4 md:w-5 md:h-5 pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearchSubmit?.()}
            placeholder={placeholder}
            className="w-full rounded-xl pl-11 md:pl-12 pr-4 py-3 text-white text-sm placeholder:text-white/50 bg-black/20 border border-white/10 focus:outline-none focus:ring-1 focus:ring-[#b4ff39]/50 focus:border-[#b4ff39]/30 transition"
            aria-label="Search teacher"
          />
        </div>
      </div>

      {/* Separator */}
      <div className="h-px bg-white/10" />

      {/* Bottom row: Academic Year + Records */}
      <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <Calendar className="w-4 h-4 text-[#b4ff39]" />
            <span className="font-medium">Academic Year:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {years.map((y) => (
              <button
                key={y.value}
                type="button"
                onClick={() => onAcademicYearChange(y.value)}
                className={`
                  px-4 py-2 rounded-xl text-sm font-medium transition-all
                  ${academicYear === y.value
                    ? "bg-[#b4ff39] text-black"
                    : "bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"
                  }
                `}
              >
                {y.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleNewYear}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
            >
              <Plus className="w-4 h-4 text-[#b4ff39]" />
              <span>New Year</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm shrink-0 w-fit">
          <FileText className="w-4 h-4 text-white/50 shrink-0" />
          <span>{recordCount} record{recordCount !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
