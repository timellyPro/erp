import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SubjectPartDraft } from "./useSubjectConfigActions";

export type SubjectEditingProps = {
  editingSubject: string | null;
  onEditingSubjectChange: (v: string | null) => void;
  editingSubjectValue: string;
  onEditingSubjectValueChange: (v: string) => void;
  onRenameSubject: (from: string) => void;
  onSubjectErrorChange: (v: string) => void;
};

/** One subject under one exam type: max marks, optional Written / Viva parts. */
export function ExamTypeSubjectRow({
  examTypeName,
  subjectKey,
  maxValue,
  onMaxChange,
  parts,
  onPartsChange,
  saving,
  subjectSaving,
  onSave,
  onRemoveFromExam,
  editing,
}: {
  examTypeName: string;
  subjectKey: string;
  maxValue: string;
  onMaxChange: (v: string) => void;
  parts: SubjectPartDraft[];
  onPartsChange: (update: (prev: SubjectPartDraft[]) => SubjectPartDraft[]) => void;
  saving: boolean;
  subjectSaving: boolean;
  onSave: () => void;
  onRemoveFromExam: () => void;
  editing: SubjectEditingProps;
}) {
  const partSum = parts.reduce((a, row) => {
    const n = Number(row.maxMarks);
    return a + (Number.isFinite(n) ? n : 0);
  }, 0);
  const isEditing = editing.editingSubject === subjectKey;

  const stopEditing = () => {
    editing.onEditingSubjectChange(null);
    editing.onEditingSubjectValueChange("");
  };

  return (
    <div className="rounded-xl bg-black/25 px-3 py-2.5 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              autoFocus
              value={editing.editingSubjectValue}
              onChange={(e) => editing.onEditingSubjectValueChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editing.onRenameSubject(subjectKey);
                }
                if (e.key === "Escape") stopEditing();
              }}
              className="min-w-0 flex-1 px-2 py-1.5 rounded-lg bg-black/40 border border-[#B4F42A]/40 text-white text-xs outline-none uppercase"
            />
            <button
              type="button"
              disabled={subjectSaving}
              onClick={() => editing.onRenameSubject(subjectKey)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-[#B4F42A]/20 disabled:opacity-50"
              title="Save name"
            >
              <Check className="w-3.5 h-3.5 text-[#B4F42A]" />
            </button>
            <button
              type="button"
              disabled={subjectSaving}
              onClick={stopEditing}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-50"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5 text-white/60" />
            </button>
          </div>
        ) : (
          <span className="min-w-0 break-words text-xs font-bold text-white sm:min-w-32">{subjectKey}</span>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">Max</span>
          {parts.length > 0 ? (
            <span className="text-xs font-bold text-[#B4F42A]">{partSum}</span>
          ) : (
            <input
              value={maxValue}
              onChange={(e) => onMaxChange(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="Max marks"
              inputMode="decimal"
              disabled={saving}
              className="w-24 sm:w-20 px-2 py-2 sm:py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50 disabled:opacity-60"
            />
          )}
        </div>
        {isEditing ? null : (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              disabled={subjectSaving}
              onClick={() => {
                editing.onSubjectErrorChange("");
                editing.onEditingSubjectChange(subjectKey);
                editing.onEditingSubjectValueChange(subjectKey);
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-50"
              title="Edit subject"
              aria-label={`Edit ${subjectKey}`}
            >
              <Pencil className="w-3.5 h-3.5 text-white/70" />
            </button>
            <button
              type="button"
              disabled={subjectSaving}
              onClick={onRemoveFromExam}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-red-500/20 disabled:opacity-50"
              title="Remove from this exam type only"
              aria-label={`Remove ${subjectKey} from ${examTypeName}`}
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        )}
      </div>
      {parts.map((row, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <input
            value={row.name}
            onChange={(e) =>
              onPartsChange((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
            }
            placeholder="e.g. Written, Viva"
            className="min-w-0 flex-1 px-3 py-2 sm:py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50"
          />
          <input
            value={row.maxMarks}
            onChange={(e) =>
              onPartsChange((prev) =>
                prev.map((r, i) =>
                  i === idx ? { ...r, maxMarks: e.target.value.replace(/[^\d.]/g, "") } : r
                )
              )
            }
            placeholder="Marks"
            inputMode="decimal"
            className="w-16 shrink-0 px-2 py-2 sm:py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50"
          />
          <button
            type="button"
            onClick={() => onPartsChange((prev) => prev.filter((_, i) => i !== idx))}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-red-500/20"
            aria-label="Remove part"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button
          type="button"
          onClick={() => onPartsChange((prev) => [...prev, { name: "", maxMarks: "" }])}
          className="min-h-10 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-white/80 inline-flex items-center justify-center gap-1 sm:min-h-0 sm:w-auto sm:py-1.5"
        >
          <Plus size={12} /> Written / Viva
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="min-h-10 px-2.5 py-2 rounded-xl bg-[#B4F42A]/20 text-[#B4F42A] border border-[#B4F42A]/30 text-[10px] font-bold disabled:opacity-50 sm:min-h-0 sm:w-auto sm:py-1.5"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
