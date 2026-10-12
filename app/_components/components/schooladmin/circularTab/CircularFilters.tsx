"use client";

import { Search, Users, GraduationCap } from "lucide-react";
import { IMPORTANCE_LEVELS } from "@/lib/constants";
import { useClasses } from "@/app/_components/hooks/useClasses";

const RECIPIENT_OPTIONS = [
  { value: "all", label: "All Recipients" },
  { value: "teachers", label: "Teachers" },
  { value: "parents", label: "Parents" },
  { value: "students", label: "Students" },
  { value: "staff", label: "Staff" },
];

interface Props {
  search: string;
  onSearch: (v: string) => void;
  importance: string;
  onImportance: (v: string) => void;
  recipient: string;
  onRecipient: (v: string) => void;
  classId: string;
  onClassId: (v: string) => void;
}

export default function CircularFilters({
  search,
  onSearch,
  importance,
  onImportance,
  recipient,
  onRecipient,
  classId,
  onClassId,
}: Props) {
  const { classes } = useClasses();

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10 flex flex-col gap-3 sm:gap-4 w-full min-w-0 overflow-hidden">
      {/* Row 1: Search + Importance */}
      <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 w-full min-w-0">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-white/50 w-4 h-4 shrink-0 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by title or ref..."
            className="w-full min-w-0 pl-10 sm:pl-11 pr-3 sm:pr-4 py-2.5 sm:py-3 rounded-xl bg-black/20 text-white text-sm sm:text-base placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-lime-400/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {["All Importance", ...IMPORTANCE_LEVELS].map((opt) => {
            const isActive = importance === opt;
            return (
              <button
                key={opt}
                onClick={() => onImportance(opt)}
                className={`
                  px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0
                  transition-all border
                  ${
                    isActive
                      ? "bg-lime-400/10 text-lime-400 border-lime-400/30"
                      : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"
                  }
                `}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Recipient + Class filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center border-t border-white/10 pt-3 sm:pt-4">
        <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
          <Users className="w-4 h-4 text-white/50 shrink-0" />
          <span className="text-sm text-white/70 shrink-0">Recipients:</span>
          <select
            value={recipient}
            onChange={(e) => onRecipient(e.target.value)}
            className="flex-1 sm:flex-initial min-w-0 max-w-full sm:max-w-[180px] px-3 py-2 rounded-xl bg-black/20 text-white text-sm border border-white/10 focus:outline-none focus:ring-1 focus:ring-lime-400/50"
          >
            {RECIPIENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-gray-900 text-white">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
          <GraduationCap className="w-4 h-4 text-white/50 shrink-0" />
          <span className="text-sm text-white/70 shrink-0">Class:</span>
          <select
            value={classId}
            onChange={(e) => onClassId(e.target.value)}
            className="flex-1 sm:flex-initial min-w-0 max-w-full sm:max-w-[200px] px-3 py-2 rounded-xl bg-black/20 text-white text-sm border border-white/10 focus:outline-none focus:ring-1 focus:ring-lime-400/50"
          >
            <option value="" className="bg-gray-900 text-white">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id} className="bg-gray-900 text-white">
                {c.name}{c.section ? ` - ${c.section}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
