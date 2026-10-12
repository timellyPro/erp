import { ChevronRight, Loader2, Send, Users } from "lucide-react";
import type { HubEvent, HubStudent } from "./createHubTypes";

export function StudentSelectionPanel({
  selectedEvent,
  loadingStudents,
  students,
  selectedStudentIds,
  onToggleStudent,
  onSelectAll,
  onDeselectAll,
  assigning,
  assignProgress,
  canAssign,
  onAssign,
  selectedCount,
}: {
  selectedEvent: HubEvent | null;
  loadingStudents: boolean;
  students: HubStudent[];
  selectedStudentIds: Set<string>;
  onToggleStudent: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  assigning: boolean;
  assignProgress: { current: number; total: number };
  canAssign: unknown;
  onAssign: () => void;
  selectedCount: number;
}) {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          4. Select Students ({selectedCount} selected)
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs font-medium text-lime-400 hover:text-lime-300"
          >
            Select All
          </button>
          <span className="text-white/30">|</span>
          <button
            type="button"
            onClick={onDeselectAll}
            className="text-xs font-medium text-white/60 hover:text-white/80"
          >
            Deselect All
          </button>
        </div>
      </div>

      {!selectedEvent && (
        <div className="rounded-xl sm:rounded-2xl border border-dashed border-white/20 bg-white/5 min-h-[220px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white/40 text-center px-4">
            <ChevronRight className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/5 flex items-center justify-center" />
            <span className="text-sm">Select a workshop to see enrolled students</span>
          </div>
        </div>
      )}

      {selectedEvent && loadingStudents && (
        <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 min-h-[220px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white/60">
            <Loader2 size={28} className="animate-spin" />
            <span className="text-sm">Loading students...</span>
          </div>
        </div>
      )}

      {selectedEvent && !loadingStudents && students.length === 0 && (
        <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 min-h-[220px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white/50 text-center px-4">
            <Users size={32} />
            <span className="text-sm">No students enrolled in this workshop yet</span>
          </div>
        </div>
      )}

      {selectedEvent && !loadingStudents && students.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 max-h-[280px] sm:max-h-[320px] overflow-y-auto no-scrollbar">
            <div className="divide-y divide-white/5">
              {students.map((s) => {
                const isSelected = selectedStudentIds.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? "bg-white/5" : "hover:bg-white/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleStudent(s.id)}
                      className="rounded border-white/30 bg-black/30 text-lime-400 focus:ring-lime-400/50"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">
                        {s.name || "Unknown"}
                      </div>
                      {s.class && (
                        <div className="text-xs text-white/50 truncate">
                          {s.class}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {assigning && (
              <span className="text-sm text-white/60">
                Assigning {assignProgress.current} of {assignProgress.total}...
              </span>
            )}
            <button
              type="button"
              onClick={onAssign}
              disabled={!canAssign}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-lime-400 px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-lime-400/30 hover:bg-lime-300 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-lime-400 w-full sm:w-auto"
            >
              {assigning ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Assign to {selectedCount} Student{selectedCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
