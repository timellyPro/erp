import { Plus, Trash2, Pencil, Check, X } from "lucide-react";

export function SubjectsManager({
  newSubject,
  onNewSubjectChange,
  onAddSubject,
  subjectSaving,
  subjectError,
  onSubjectErrorChange,
  subjectsLoading,
  subjects,
  editingSubject,
  onEditingSubjectChange,
  editingSubjectValue,
  onEditingSubjectValueChange,
  onRenameSubject,
  onDeleteSubject,
}: {
  newSubject: string;
  onNewSubjectChange: (v: string) => void;
  onAddSubject: () => void;
  subjectSaving: boolean;
  subjectError: string;
  onSubjectErrorChange: (v: string) => void;
  subjectsLoading: boolean;
  subjects: string[];
  editingSubject: string | null;
  onEditingSubjectChange: (v: string | null) => void;
  editingSubjectValue: string;
  onEditingSubjectValueChange: (v: string) => void;
  onRenameSubject: (from: string) => void;
  onDeleteSubject: (name: string) => void;
}) {
  return (
    <div className="somu border-none bg-white/5! rounded-2xl sm:rounded-3xl p-4 sm:p-5 mb-4 sm:mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold">Subjects</h3>
          <p className="text-xs text-white/50">
            Add, rename, or remove subjects. Only removes from this list — your choice.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full md:w-auto">
          <input
            value={newSubject}
            onChange={(e) => onNewSubjectChange(e.target.value.toUpperCase())}
            placeholder="e.g. MATHEMATICS, SCIENCE"
            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-[#B4F42A]/50 uppercase"
          />
          <button
            type="button"
            onClick={onAddSubject}
            disabled={subjectSaving}
            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-[#B4F42A] text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Plus size={16} />
            {subjectSaving ? "Saving..." : "Add"}
          </button>
        </div>
      </div>

      {subjectError && (
        <p className="mt-2 text-xs font-bold text-red-400">{subjectError}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {subjectsLoading ? (
          <span className="text-xs text-white/50">Loading subjects...</span>
        ) : subjects.length === 0 ? (
          <span className="text-xs text-white/50">
            {subjectError ? "Subjects could not be loaded." : "No subjects found."}
          </span>
        ) : (
          subjects.map((t) => (
            <div
              key={t}
              className="flex max-w-full items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-white/80"
            >
              {editingSubject === t ? (
                <>
                  <input
                    autoFocus
                    value={editingSubjectValue}
                    onChange={(e) =>
                      onEditingSubjectValueChange(e.target.value.toUpperCase())
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onRenameSubject(t);
                      }
                      if (e.key === "Escape") {
                        onEditingSubjectChange(null);
                        onEditingSubjectValueChange("");
                      }
                    }}
                    className="w-full min-w-0 max-w-36 px-2 py-1 rounded-lg bg-black/40 border border-[#B4F42A]/40 text-white text-xs outline-none uppercase"
                  />
                  <button
                    type="button"
                    disabled={subjectSaving}
                    onClick={() => onRenameSubject(t)}
                    className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-[#B4F42A]/20 disabled:opacity-50"
                    title="Save name"
                  >
                    <Check className="w-3 h-3 text-[#B4F42A]" />
                  </button>
                  <button
                    type="button"
                    disabled={subjectSaving}
                    onClick={() => {
                      onEditingSubjectChange(null);
                      onEditingSubjectValueChange("");
                    }}
                    className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-white/10 disabled:opacity-50"
                    title="Cancel"
                  >
                    <X className="w-3 h-3 text-white/60" />
                  </button>
                </>
              ) : (
                <>
                  <span className="break-words">{t}</span>
                  <button
                    type="button"
                    disabled={subjectSaving}
                    onClick={() => {
                      onSubjectErrorChange("");
                      onEditingSubjectChange(t);
                      onEditingSubjectValueChange(t);
                    }}
                    className="ml-1 inline-flex items-center justify-center rounded-full p-0.5 hover:bg-white/10 disabled:opacity-50"
                    title="Edit subject"
                  >
                    <Pencil className="w-3 h-3 text-white/50" />
                  </button>
                  <button
                    type="button"
                    disabled={subjectSaving}
                    onClick={() => onDeleteSubject(t)}
                    className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-red-500/20 disabled:opacity-50"
                    title="Remove from every exam type"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
