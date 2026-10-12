import { useState } from "react";
import type { ExamTypeOption } from "@/lib/exams/examTypes";

/**
 * Exam-type CRUD/state. `examTypes` is owned by the parent's exams cache
 * reducer (see useExamsTabState) and passed in along with `setExamTypes`,
 * which dispatches into that shared reducer — no snapshot/closure
 * indirection needed to keep cache writes in sync with sibling hooks.
 */
export function useExamTypeActions(
  examTypes: ExamTypeOption[],
  setExamTypes: (next: ExamTypeOption[]) => void
) {
  const [examTypesLoading, setExamTypesLoading] = useState(true);
  const [newExamType, setNewExamType] = useState("");
  const [newExamTypeMax, setNewExamTypeMax] = useState("");
  const [examTypeError, setExamTypeError] = useState("");
  const [examTypeSaving, setExamTypeSaving] = useState(false);
  const [maxMarksDrafts, setMaxMarksDrafts] = useState<Record<string, string>>({});
  const [sectionDraftsByType, setSectionDraftsByType] = useState<
    Record<string, Array<{ id?: string; name: string; maxMarks: string }>>
  >({});
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionError, setSectionError] = useState("");

  const syncMaxDrafts = (types: ExamTypeOption[]) => {
    const next: Record<string, string> = {};
    const nextSections: Record<string, Array<{ id?: string; name: string; maxMarks: string }>> = {};
    types.forEach((t) => {
      next[t.name] = t.maxMarks != null ? String(t.maxMarks) : "";
      nextSections[t.name] = (t.sections ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        maxMarks: String(s.maxMarks),
      }));
    });
    setMaxMarksDrafts(next);
    setSectionDraftsByType(nextSections);
  };

  const deleteExamType = async (name: string) => {
    const upperName = name.trim().toUpperCase();
    if (!upperName) return;

    if (examTypes.length <= 1) {
      const confirmed = window.confirm(
        `"${upperName}" is the only exam type.\n\nAre you sure you want to delete it?`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(
        `Are you sure you want to delete exam type "${upperName}"?`
      );
      if (!confirmed) return;
    }

    setExamTypeError("");
    setExamTypeSaving(true);
    try {
      const res = await fetch(`/api/exam-types?name=${encodeURIComponent(upperName)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setExamTypeError(
          data?.message || "Failed to delete exam type. It may be in use."
        );
        return;
      }

      const next = examTypes.filter((type) => type.name.toUpperCase() !== upperName);
      setExamTypes(next);
      syncMaxDrafts(next);
    } catch (e) {
      console.error("Failed to delete exam type", e);
      setExamTypeError("Failed to delete exam type");
    } finally {
      setExamTypeSaving(false);
    }
  };

  const saveExamTypeMaxMarks = async (name: string) => {
    const upperName = name.trim().toUpperCase();
    const raw = maxMarksDrafts[upperName] ?? "";
    const maxMarks = raw.trim() === "" ? null : Number(raw);
    if (raw.trim() !== "" && (!Number.isFinite(maxMarks) || (maxMarks as number) <= 0)) {
      setExamTypeError("Max marks must be a positive number");
      return;
    }

    setExamTypeError("");
    setExamTypeSaving(true);
    try {
      const res = await fetch("/api/exam-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: upperName, maxMarks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExamTypeError(data?.message || "Failed to update max marks");
        return;
      }
      const updatedMax = data?.examType?.maxMarks ?? maxMarks;
      let next = examTypes.map((t) =>
        t.name === upperName ? { ...t, maxMarks: updatedMax } : t
      );
      if (!next.some((t) => t.name === upperName) && data?.examType) {
        next = [
          ...next,
          { name: data.examType.name, maxMarks: data.examType.maxMarks ?? null, sections: data.examType.sections ?? [] },
        ].sort((a, b) => a.name.localeCompare(b.name));
      }
      setExamTypes(next);
      syncMaxDrafts(next);
    } catch (e) {
      console.error("Failed to update max marks", e);
      setExamTypeError("Failed to update max marks");
    } finally {
      setExamTypeSaving(false);
    }
  };

  const addExamType = async () => {
    const name = newExamType.trim().toUpperCase();
    if (!name) {
      setExamTypeError("Enter exam type name");
      return;
    }
    if (examTypes.some((t) => t.name.toUpperCase() === name)) {
      setExamTypeError("This exam type name already exists");
      return;
    }

    const maxRaw = newExamTypeMax.trim();
    const maxMarks = maxRaw === "" ? null : Number(maxRaw);
    if (maxRaw !== "" && (!Number.isFinite(maxMarks) || (maxMarks as number) <= 0)) {
      setExamTypeError("Max marks must be a positive number");
      return;
    }

    setExamTypeError("");
    setExamTypeSaving(true);
    try {
      const res = await fetch("/api/exam-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, maxMarks }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setExamTypeError("This exam type name already exists");
        return;
      }
      if (!res.ok) {
        setExamTypeError(data?.message || "Failed to add exam type");
        return;
      }
      setNewExamType("");
      setNewExamTypeMax("");
      const created: ExamTypeOption = {
        name: data?.examType?.name ?? name,
        maxMarks: data?.examType?.maxMarks ?? maxMarks,
        sections: Array.isArray(data?.examType?.sections) ? data.examType.sections : [],
        subjectConfigs: [],
      };
      const next = [...examTypes.filter((t) => t.name !== created.name), created].sort(
        (a, b) => a.name.localeCompare(b.name)
      );
      setExamTypes(next);
      syncMaxDrafts(next);
    } catch (e) {
      console.error("Failed to add exam type", e);
      setExamTypeError("Failed to add exam type");
    } finally {
      setExamTypeSaving(false);
    }
  };

  const saveExamTypeSections = async (examTypeName: string) => {
    const upper = examTypeName.trim().toUpperCase();
    const drafts = sectionDraftsByType[upper] ?? [];
    for (const row of drafts) {
      if (!row.name.trim()) {
        setSectionError("Each subsection needs a name");
        return;
      }
      const n = Number(row.maxMarks);
      if (!Number.isFinite(n) || n <= 0) {
        setSectionError(`"${row.name}": max marks must be a positive number`);
        return;
      }
    }
    setSectionError("");
    setSectionSaving(true);
    try {
      const res = await fetch("/api/exam-types/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: upper,
          sections: drafts.map((s, i) => ({
            name: s.name.trim(),
            maxMarks: Number(s.maxMarks),
            order: i,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSectionError(data?.message || "Failed to save subsections");
        return;
      }
      const et = data?.examType;
      const sections = Array.isArray(et?.sections) ? et.sections : [];
      const next = examTypes.map((t) =>
        t.name === upper
          ? {
              ...t,
              maxMarks: et?.maxMarks ?? (sections.length
                  ? sections.reduce((a: number, s: { maxMarks: number }) => a + s.maxMarks, 0)
                  : t.maxMarks),
              sections,
            }
          : t
      );
      if (!next.some((t) => t.name === upper) && et) {
        next.push({
          name: et.name,
          maxMarks: et.maxMarks ?? null,
          sections,
        });
        next.sort((a, b) => a.name.localeCompare(b.name));
      }
      setExamTypes(next);
      syncMaxDrafts(next);
    } catch (e) {
      console.error(e);
      setSectionError("Failed to save subsections");
    } finally {
      setSectionSaving(false);
    }
  };

  return {
    examTypes,
    examTypesLoading,
    setExamTypesLoading,
    newExamType,
    setNewExamType,
    newExamTypeMax,
    setNewExamTypeMax,
    examTypeError,
    setExamTypeError,
    examTypeSaving,
    maxMarksDrafts,
    setMaxMarksDrafts,
    sectionDraftsByType,
    setSectionDraftsByType,
    sectionSaving,
    sectionError,
    syncMaxDrafts,
    deleteExamType,
    saveExamTypeMaxMarks,
    addExamType,
    saveExamTypeSections,
  };
}
