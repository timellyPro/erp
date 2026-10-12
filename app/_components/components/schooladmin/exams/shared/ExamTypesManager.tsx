import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { ExamTypeOption } from "@/lib/exams/examTypes";
import { ExamTypeSubjectsPanel } from "./ExamTypeSubjectsPanel";
import type { SubjectEditingProps } from "./ExamTypeSubjectRow";
import type { SubjectPartDraft } from "./useSubjectConfigActions";

export function ExamTypesManager({
  examTypesLoading,
  examTypes,
  newExamType,
  onNewExamTypeChange,
  onAddExamType,
  examTypeSaving,
  examTypeError,
  sectionError,
  subjectConfigMessage,
  onDeleteExamType,
  openExamType,
  onOpenExamTypeChange,
  subjects,
  removedByExam,
  subjectMaxByExam,
  onSubjectMaxChange,
  subjectPartsByKey,
  onSubjectPartsChange,
  subjectConfigSavingFor,
  subjectSaving,
  onSaveSubject,
  onRemoveSubjectFromExam,
  onRestoreSubjectOnExam,
  editing,
}: {
  examTypesLoading: boolean;
  examTypes: ExamTypeOption[];
  newExamType: string;
  onNewExamTypeChange: (v: string) => void;
  onAddExamType: () => void;
  examTypeSaving: boolean;
  examTypeError: string;
  sectionError: string;
  subjectConfigMessage: string;
  onDeleteExamType: (name: string) => void;
  openExamType: string | null;
  onOpenExamTypeChange: (update: (prev: string | null) => string | null) => void;
  subjects: string[];
  removedByExam: Record<string, string[]>;
  subjectMaxByExam: Record<string, string>;
  onSubjectMaxChange: (rowKey: string, value: string) => void;
  subjectPartsByKey: Record<string, SubjectPartDraft[]>;
  onSubjectPartsChange: (
    rowKey: string,
    update: (prev: SubjectPartDraft[]) => SubjectPartDraft[]
  ) => void;
  subjectConfigSavingFor: string | null;
  subjectSaving: boolean;
  onSaveSubject: (examTypeName: string, subjectKey: string) => void;
  onRemoveSubjectFromExam: (examTypeName: string, subjectKey: string) => void;
  onRestoreSubjectOnExam: (examTypeName: string, subjectKey: string) => void;
  editing: SubjectEditingProps;
}) {
  return (
    <div className="somu border-none bg-white/5! rounded-2xl sm:rounded-3xl p-4 sm:p-5 mb-4 sm:mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold">Exam Types</h3>
          <p className="text-xs text-white/50">
            Exam types have no max marks. Each subject under an exam type has max marks, and parts such as Written and Viva.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full md:w-auto">
          <input
            value={newExamType}
            onChange={(e) => onNewExamTypeChange(e.target.value.toUpperCase())}
            placeholder="e.g. HALF YEARLY"
            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-[#B4F42A]/50 uppercase"
          />
          <button
            type="button"
            onClick={onAddExamType}
            disabled={examTypeSaving}
            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-[#B4F42A] text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Plus size={16} />
            {examTypeSaving ? "Saving..." : "Add"}
          </button>
        </div>
      </div>

      {examTypeError && (
        <p className="mt-2 text-xs font-bold text-red-400">{examTypeError}</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {examTypesLoading ? (
          <span className="text-xs text-white/50">Loading exam types...</span>
        ) : examTypes.length === 0 ? (
          <span className="text-xs text-white/50">
            {examTypeError ? "Exam types could not be loaded." : "No exam types found."}
          </span>
        ) : (
          examTypes.map((t) => {
            const examOpen = openExamType === t.name;
            const configuredCount = t.subjectConfigs?.length ?? 0;
            return (
              <div
                key={t.name}
                className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-white/80">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
                    aria-expanded={examOpen}
                    aria-label={examOpen ? `Hide subjects for ${t.name}` : `Show subjects for ${t.name}`}
                    onClick={() => onOpenExamTypeChange((current) => (current === t.name ? null : t.name))}
                  >
                    <ChevronDown
                      size={16}
                      className={`text-white/70 transition-transform ${examOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate">{t.name}</span>
                    <span className="block truncate text-[10px] font-medium text-white/40">
                      {configuredCount > 0
                        ? `${configuredCount} subjects set`
                        : "Tap to set subject marks"}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={examTypeSaving}
                    onClick={() => onDeleteExamType(t.name)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-red-500/20 disabled:opacity-50"
                    title="Delete exam type"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
                {examOpen && (
                  <ExamTypeSubjectsPanel
                    examTypeName={t.name}
                    subjects={subjects}
                    removedSubjects={removedByExam[t.name] ?? []}
                    subjectMaxByExam={subjectMaxByExam}
                    onSubjectMaxChange={onSubjectMaxChange}
                    subjectPartsByKey={subjectPartsByKey}
                    onSubjectPartsChange={onSubjectPartsChange}
                    subjectConfigSavingFor={subjectConfigSavingFor}
                    subjectSaving={subjectSaving}
                    onSaveSubject={onSaveSubject}
                    onRemoveFromExam={onRemoveSubjectFromExam}
                    onRestoreOnExam={onRestoreSubjectOnExam}
                    editing={editing}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
      {sectionError && (
        <p className="mt-2 text-xs font-bold text-red-400">{sectionError}</p>
      )}
      {subjectConfigMessage && (
        <p className="mt-2 text-xs font-bold text-white/70">{subjectConfigMessage}</p>
      )}
    </div>
  );
}
