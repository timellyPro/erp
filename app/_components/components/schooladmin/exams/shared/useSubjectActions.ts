import { useState } from "react";
import type { ExamTypeOption } from "@/lib/exams/examTypes";
import { subjectMaxKey } from "./useSubjectConfigActions";

/** What subject mutators need from the exam-type side of the exams cache. */
export type SubjectActionsContext = {
  examTypes: ExamTypeOption[];
  setExamTypes: (next: ExamTypeOption[]) => void;
  removedByExam: Record<string, string[]>;
  setRemovedByExam: (next: Record<string, string[]>) => void;
  dropDraftsForExamSubject: (rowKey: string) => void;
  dropDraftsForSubject: (upperName: string) => void;
  renameDraftsForSubject: (fromName: string, toName: string) => void;
};

/**
 * Subject CRUD/state. `subjects` is owned by the parent's exams cache
 * reducer (see useExamsTabState) and passed in along with `setSubjects`,
 * which dispatches into that shared reducer — no snapshot/closure
 * indirection needed to keep cache writes in sync with sibling hooks.
 */
export function useSubjectActions(
  subjects: string[],
  setSubjects: (next: string[]) => void,
  ctx: SubjectActionsContext
) {
  const {
    examTypes,
    setExamTypes,
    removedByExam,
    setRemovedByExam,
    dropDraftsForExamSubject,
    dropDraftsForSubject,
    renameDraftsForSubject,
  } = ctx;
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [newSubject, setNewSubject] = useState("");
  const [subjectError, setSubjectError] = useState("");
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editingSubjectValue, setEditingSubjectValue] = useState("");

  const deleteSubjectFromExam = async (examType: string, name: string) => {
    const examName = examType.trim().toUpperCase();
    const upperName = name.trim().toUpperCase();
    if (!examName || !upperName) return;

    const confirmed = window.confirm(
      `Remove "${upperName}" from ${examName} only?\n\nIt stays in the subjects list and in other exam types. Existing marks are not deleted.`
    );
    if (!confirmed) return;

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch(
        `/api/exam-subjects?name=${encodeURIComponent(upperName)}&examType=${encodeURIComponent(examName)}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubjectError(data?.message || "Failed to remove subject from this exam type.");
        return;
      }

      const nextRemoved: Record<string, string[]> = { ...removedByExam };
      const current = new Set(nextRemoved[examName] ?? []);
      current.add(upperName);
      nextRemoved[examName] = Array.from(current).sort();
      setRemovedByExam(nextRemoved);
      setExamTypes(
        examTypes.map((exam) =>
          exam.name.trim().toUpperCase() === examName
            ? {
                ...exam,
                subjectConfigs: (exam.subjectConfigs ?? []).filter(
                  (config) => config.subject.trim().toUpperCase() !== upperName
                ),
              }
            : exam
        )
      );
      dropDraftsForExamSubject(subjectMaxKey(examName, upperName));
    } catch (e) {
      console.error("Failed to remove subject from exam type", e);
      setSubjectError("Failed to remove subject from this exam type");
    } finally {
      setSubjectSaving(false);
    }
  };

  const restoreSubjectOnExam = async (examType: string, name: string) => {
    const examName = examType.trim().toUpperCase();
    const upperName = name.trim().toUpperCase();
    if (!examName || !upperName) return;
    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch("/api/exam-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: upperName, restoreExamType: examName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubjectError(data?.message || "Failed to add the subject back.");
        return;
      }
      const nextRemoved: Record<string, string[]> = { ...removedByExam };
      nextRemoved[examName] = (nextRemoved[examName] ?? []).filter((s) => s !== upperName);
      setRemovedByExam(nextRemoved);
    } catch (e) {
      console.error("Failed to restore subject on exam type", e);
      setSubjectError("Failed to add the subject back");
    } finally {
      setSubjectSaving(false);
    }
  };

  const deleteSubject = async (name: string) => {
    const upperName = name.trim().toUpperCase();
    if (!upperName) return;

    const confirmed = window.confirm(
      `Remove "${upperName}" from the subjects list and every exam type?\n\nExisting marks are not deleted.`
    );
    if (!confirmed) return;

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch(`/api/exam-subjects?name=${encodeURIComponent(upperName)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSubjectError(data?.message || "Failed to delete subject.");
        return;
      }

      const nextRemoved: Record<string, string[]> = {};
      for (const [examName, list] of Object.entries(removedByExam)) {
        const kept = list.filter((s) => s !== upperName);
        if (kept.length > 0) nextRemoved[examName] = kept;
      }
      setRemovedByExam(nextRemoved);
      setSubjects(subjects.filter((subject) => subject.toUpperCase() !== upperName));
      setExamTypes(
        examTypes.map((exam) => ({
          ...exam,
          subjectConfigs: (exam.subjectConfigs ?? []).filter(
            (config) => config.subject.trim().toUpperCase() !== upperName
          ),
        }))
      );
      dropDraftsForSubject(upperName);
      if (editingSubject === upperName) {
        setEditingSubject(null);
        setEditingSubjectValue("");
      }
    } catch (e) {
      console.error("Failed to delete subject", e);
      setSubjectError("Failed to delete subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  const renameSubject = async (from: string) => {
    const fromName = from.trim().toUpperCase();
    const toName = editingSubjectValue.trim().toUpperCase();
    if (!fromName || !toName) {
      setSubjectError("Enter a subject name");
      return;
    }
    if (fromName === toName) {
      setEditingSubject(null);
      setEditingSubjectValue("");
      return;
    }
    if (subjects.some((s) => s.toUpperCase() === toName && s.toUpperCase() !== fromName)) {
      setSubjectError("This subject name already exists");
      return;
    }

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch("/api/exam-subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ from: fromName, to: toName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubjectError(data?.message || "Failed to rename subject");
        return;
      }
      const nextRemoved: Record<string, string[]> = {};
      for (const [examName, list] of Object.entries(removedByExam)) {
        nextRemoved[examName] = Array.from(
          new Set(list.map((s) => (s === fromName ? toName : s)))
        ).sort();
      }
      setRemovedByExam(nextRemoved);
      setSubjects(
        Array.from(new Set(subjects.map((s) => (s.toUpperCase() === fromName ? toName : s)))).sort()
      );
      setExamTypes(
        examTypes.map((exam) => ({
          ...exam,
          subjectConfigs: (exam.subjectConfigs ?? []).map((config) =>
            config.subject.trim().toUpperCase() === fromName
              ? { ...config, subject: toName }
              : config
          ),
        }))
      );
      renameDraftsForSubject(fromName, toName);
      setEditingSubject(null);
      setEditingSubjectValue("");
    } catch (e) {
      console.error("Failed to rename subject", e);
      setSubjectError("Failed to rename subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  const addSubject = async () => {
    const name = newSubject.trim().toUpperCase();
    if (!name) {
      setSubjectError("Enter subject name");
      return;
    }
    if (subjects.some((t) => t.toUpperCase() === name)) {
      setSubjectError("This subject name already exists");
      return;
    }

    setSubjectError("");
    setSubjectSaving(true);
    try {
      const res = await fetch("/api/exam-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setSubjectError("This subject name already exists");
        return;
      }
      if (!res.ok) {
        setSubjectError(data?.message || "Failed to add subject");
        return;
      }
      setNewSubject("");
      const next = Array.from(new Set([...subjects, name])).sort();
      setSubjects(next);
    } catch (e) {
      console.error("Failed to add subject", e);
      setSubjectError("Failed to add subject");
    } finally {
      setSubjectSaving(false);
    }
  };

  return {
    subjects,
    subjectsLoading,
    setSubjectsLoading,
    newSubject,
    setNewSubject,
    subjectError,
    setSubjectError,
    subjectSaving,
    editingSubject,
    setEditingSubject,
    editingSubjectValue,
    setEditingSubjectValue,
    removedByExam,
    deleteSubject,
    deleteSubjectFromExam,
    restoreSubjectOnExam,
    renameSubject,
    addSubject,
  };
}
