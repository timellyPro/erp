"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { EXAM_TERM_STATUS } from "@/lib/constants";
import type { ClassItem } from "@/app/_components/hooks/useClasses";
import { createExamTerm, updateExamTerm } from "@/lib/api/examTerms";
import Spinner from "@/app/_components/components/common/Spinner";

type ExamTermStatus = "UPCOMING" | "COMPLETED";

interface ExamTermFormValues {
  name: string;
  description: string;
  classId: string;
  status: ExamTermStatus;
}

interface NewExamTermModalProps {
  classes: ClassItem[];
  onClose: () => void;
  onSaved: (savedId?: string) => void;
  mode?: "create" | "edit";
  termId?: string;
  initialValues?: Partial<ExamTermFormValues>;
}

export default function NewExamTermModal({
  classes,
  onClose,
  onSaved,
  mode = "create",
  termId,
  initialValues,
}: NewExamTermModalProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [classId, setClassId] = useState(initialValues?.classId ?? "");
  const [status, setStatus] = useState<ExamTermStatus>(initialValues?.status ?? "UPCOMING");
  const [saving, setSaving] = useState(false);

  const isEdit = mode === "edit";

  useEffect(() => {
    setName(initialValues?.name ?? "");
    setDescription(initialValues?.description ?? "");
    setClassId(initialValues?.classId ?? "");
    setStatus((initialValues?.status as ExamTermStatus) ?? "UPCOMING");
  }, [initialValues, mode, termId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !classId) return;
    if (isEdit && !termId) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        classId,
        status,
      };
      const { ok, data } = isEdit
        ? await updateExamTerm(termId as string, payload)
        : await createExamTerm(payload);

      if (!ok) throw new Error(data.message || "Failed to save term");

      onSaved(data?.term?.id);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 ">
      <div
        className="bg-[#0F172A] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl"
        style={{
          background: "linear-gradient(180deg, rgba(10,27,57,0.98) 0%, rgba(9,22,47,0.96) 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-white mb-6">
            {isEdit ? "Edit Exam Term" : "New Exam Term"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl border border-white/15 p-2.5 text-white/80 hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-white/60">Term Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Term 2 Examination"
              className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-3.5 text-base text-white placeholder:text-white/45"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white/60">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              rows={4}
              className="w-full resize-none rounded-2xl border border-white/15 bg-white/8 px-4 py-3.5 text-base text-white placeholder:text-white/45"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Class</label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-3.5 text-base text-white"
                required
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.section ?? ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-white/60">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ExamTermStatus)}
                className="w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-3.5 text-base text-white"
              >
                {EXAM_TERM_STATUS.map((s: { value: string; label: string }) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
               hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className=" flex-1 py-2.5 rounded-xl bg-lime-400 text-black font-bold 
              hover:bg-lime-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Spinner size={18} />
                  Saving...
                </>
              ) : (
                "Save Term"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
