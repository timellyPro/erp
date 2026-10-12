import { ExamTypeSubjectRow, type SubjectEditingProps } from "./ExamTypeSubjectRow";
import { subjectMaxKey, type SubjectPartDraft } from "./useSubjectConfigActions";

/** The expanded body of one exam type: every subject's max marks / parts, plus "add back" chips. */
export function ExamTypeSubjectsPanel({
  examTypeName,
  subjects,
  removedSubjects,
  subjectMaxByExam,
  onSubjectMaxChange,
  subjectPartsByKey,
  onSubjectPartsChange,
  subjectConfigSavingFor,
  subjectSaving,
  onSaveSubject,
  onRemoveFromExam,
  onRestoreOnExam,
  editing,
}: {
  examTypeName: string;
  subjects: string[];
  removedSubjects: string[];
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
  onRemoveFromExam: (examTypeName: string, subjectKey: string) => void;
  onRestoreOnExam: (examTypeName: string, subjectKey: string) => void;
  editing: SubjectEditingProps;
}) {
  const visibleSubjects = subjects.filter(
    (subjectName) => !removedSubjects.includes(subjectName.trim().toUpperCase())
  );

  return (
    <div className="border-t border-white/10 px-3 py-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
        Subjects for {examTypeName}
      </p>
      <p className="text-[10px] text-white/35">
        Delete removes the subject from {examTypeName} only. It stays in the subjects list and in other exam types.
      </p>
      {subjects.length === 0 ? (
        <p className="text-[10px] text-white/40">Add subjects first, then set max marks for each one.</p>
      ) : (
        visibleSubjects.map((subjectName) => {
          const subjectKey = subjectName.trim().toUpperCase();
          const rowKey = subjectMaxKey(examTypeName, subjectKey);
          return (
            <ExamTypeSubjectRow
              key={subjectKey}
              examTypeName={examTypeName}
              subjectKey={subjectKey}
              maxValue={subjectMaxByExam[rowKey] ?? ""}
              onMaxChange={(v) => onSubjectMaxChange(rowKey, v)}
              parts={subjectPartsByKey[rowKey] ?? []}
              onPartsChange={(update) => onSubjectPartsChange(rowKey, update)}
              saving={subjectConfigSavingFor === rowKey}
              subjectSaving={subjectSaving}
              onSave={() => onSaveSubject(examTypeName, subjectKey)}
              onRemoveFromExam={() => onRemoveFromExam(examTypeName, subjectKey)}
              editing={editing}
            />
          );
        })
      )}
      {removedSubjects.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {removedSubjects.map((removedName) => (
            <button
              key={removedName}
              type="button"
              disabled={subjectSaving}
              onClick={() => onRestoreOnExam(examTypeName, removedName)}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-white/10 bg-white/5 text-white/50 hover:text-white disabled:opacity-50"
            >
              {removedName} · add back
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
