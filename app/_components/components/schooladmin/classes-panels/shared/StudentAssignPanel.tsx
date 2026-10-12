import { Check, Loader2, Save, Search, Users } from "lucide-react";
import SearchInput from "../../../common/SearchInput";
import TimellyLoader from "../../../common/TimellyLoader";
import type { SectionStudent } from "./useAssignSectionState";

export function StudentAssignPanel({
  selectedClassName,
  filteredStudents,
  selectedStudentIds,
  selectionFilteredBySearch,
  clearSelection,
  studentSearch,
  onStudentSearchChange,
  isLoadingStudents,
  allVisibleSelected,
  someVisibleSelected,
  toggleAllVisible,
  toggleStudent,
  resolvedTargetSectionName,
  canAssign,
  isSaving,
  onAssign,
}: {
  selectedClassName: string;
  filteredStudents: SectionStudent[];
  selectedStudentIds: Set<string>;
  selectionFilteredBySearch: boolean;
  clearSelection: () => void;
  studentSearch: string;
  onStudentSearchChange: (v: string) => void;
  isLoadingStudents: boolean;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  toggleAllVisible: () => void;
  toggleStudent: (id: string) => void;
  resolvedTargetSectionName: string;
  canAssign: boolean;
  isSaving: boolean;
  onAssign: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-white/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users size={16} className="text-violet-400" />
          Students in {selectedClassName}
          <span className="text-white/50 font-normal">
            ({filteredStudents.length})
          </span>
          {selectedStudentIds.size > 0 && (
            <span className="rounded-full bg-lime-400/20 border border-lime-400/30 px-2 py-0.5 text-[11px] font-semibold text-lime-300">
              {selectedStudentIds.size} selected
              {selectionFilteredBySearch
                ? ` (${filteredStudents.length} shown)`
                : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {selectedStudentIds.size > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/10 cursor-pointer"
            >
              Clear selection
            </button>
          )}
          <div className="w-full sm:w-[240px]">
            <SearchInput
              value={studentSearch}
              onChange={onStudentSearchChange}
              placeholder="Search students..."
              icon={Search}
              variant="glass"
            />
          </div>
        </div>
      </div>

      {isLoadingStudents ? (
        <div className="p-6">
          <TimellyLoader
            compact
            bare
            title="Loading students"
            steps={["Class roster", "Sections"]}
          />
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="p-8 text-center text-sm text-white/50">
          No active students found for this class.
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0B1220]/95 backdrop-blur-sm z-10">
              <tr className="text-left text-[11px] uppercase tracking-wide text-white/40 border-b border-white/10">
                <th className="px-4 py-3 w-10">
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    title={allVisibleSelected ? "Deselect all" : "Select all"}
                    className={`h-5 w-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                      allVisibleSelected
                        ? "bg-lime-400 border-lime-400 text-black"
                        : someVisibleSelected
                          ? "bg-lime-400/40 border-lime-400 text-black"
                          : "border-white/20 bg-white/5 text-transparent hover:border-white/40"
                    }`}
                  >
                    <Check size={12} />
                  </button>
                </th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Roll No</th>
                <th className="px-4 py-3">Admission No</th>
                <th className="px-4 py-3">Current Section</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => {
                const isSelected = selectedStudentIds.has(student.id);
                const currentSection = student.class?.section ?? "—";

                return (
                  <tr
                    key={student.id}
                    onClick={() => toggleStudent(student.id)}
                    className={`border-b border-white/5 transition-colors cursor-pointer ${
                      isSelected ? "bg-lime-400/5" : "hover:bg-white/2"
                    }`}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleStudent(student.id)}
                        className={`h-5 w-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-lime-400 border-lime-400 text-black"
                            : "border-white/20 bg-white/5 text-transparent hover:border-white/40"
                        }`}
                      >
                        <Check size={12} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">
                        {student.user?.name ?? "—"}
                      </div>
                      {student.user?.email && (
                        <div className="text-[11px] text-white/40">
                          {student.user.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {student.rollNo ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {student.admissionNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/80">
                        {currentSection || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filteredStudents.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t border-white/10 bg-black/30">
          <p className="text-xs text-white/50">
            {selectedStudentIds.size === 0
              ? "Check the students you want to move, then assign them to the section above."
              : selectionFilteredBySearch
                ? `${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? "" : "s"} selected (${filteredStudents.length} visible in search) will be assigned to section ${resolvedTargetSectionName || "—"}.`
                : resolvedTargetSectionName
                  ? `${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? "" : "s"} will be assigned to section ${resolvedTargetSectionName}.`
                  : `${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? "" : "s"} selected — pick a section above.`}
          </p>
          <button
            type="button"
            onClick={onAssign}
            disabled={!canAssign}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-semibold text-black hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            {isSaving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {isSaving
              ? "Assigning..."
              : `Assign ${selectedStudentIds.size > 0 ? selectedStudentIds.size : ""} to Section`.trim()}
          </button>
        </div>
      )}
    </div>
  );
}
