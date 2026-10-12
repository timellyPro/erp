import { Check, Search } from "lucide-react";
import type { ClassOption } from "./teacherDownloadReportsTypes";

export function TeacherClassAndExamPicker({
  selectedClassIds,
  allVisibleSelected,
  onSelectAll,
  classSearch,
  onClassSearchChange,
  classesLoading,
  filteredClasses,
  onToggleClass,
  examTypeOptions,
  selectedExamType,
  onSelectedExamTypeChange,
}: {
  selectedClassIds: Set<string>;
  allVisibleSelected: boolean;
  onSelectAll: () => void;
  classSearch: string;
  onClassSearchChange: (v: string) => void;
  classesLoading: boolean;
  filteredClasses: ClassOption[];
  onToggleClass: (id: string) => void;
  examTypeOptions: string[];
  selectedExamType: string;
  onSelectedExamTypeChange: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Class Selection */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
              Select Classes
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">
                {selectedClassIds.size} selected
              </span>
              <button
                type="button"
                onClick={onSelectAll}
                className="text-xs text-lime-400 hover:text-lime-300 font-medium"
              >
                {allVisibleSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
          </div>

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search classes..."
              value={classSearch}
              onChange={(e) => onClassSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-black/30 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/25 outline-none focus:border-lime-400/40"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {classesLoading ? (
              <div className="col-span-full flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
              </div>
            ) : filteredClasses.length === 0 ? (
              <p className="col-span-full text-white/30 text-sm text-center py-4">No classes found</p>
            ) : (
              filteredClasses.map((cls) => {
                const selected = selectedClassIds.has(cls.id);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => onToggleClass(cls.id)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition text-left flex items-center gap-2 ${
                      selected
                        ? "bg-lime-400/15 text-lime-400 border-lime-400/30"
                        : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition flex-shrink-0 ${
                        selected
                          ? "bg-lime-400 border-lime-400"
                          : "border-white/20"
                      }`}
                    >
                      {selected && <Check size={10} className="text-black" />}
                    </div>
                    <span className="truncate">{cls.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Exam Type */}
        <div>
          <label className="block text-xs font-medium text-white/60 mb-3 uppercase tracking-widest">
            Exam Type
          </label>
          <div className="space-y-2">
            {examTypeOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onSelectedExamTypeChange(opt)}
                className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition text-left ${
                  selectedExamType === opt
                    ? "bg-lime-400/15 text-lime-400 border-lime-400/30"
                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                }`}
              >
                {opt === "ALL" ? "All Exams" : opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
