import { useState } from "react";
import type { ExamTypeSectionOption } from "@/lib/exams/examTypes";
import type { SavedMarkRow, StudentRow } from "./types";

/** Saved rows first, then by name — keeps the table order stable across saves. */
export function sortRowsSavedFirst(rows: StudentRow[]): StudentRow[] {
  return [...rows].sort((a, b) => {
    const aSaved = a.markId ? 0 : 1;
    const bSaved = b.markId ? 0 : 1;
    if (aSaved !== bSaved) return aSaved - bSaved;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function useMarksSaveAll({
  form,
  rows,
  setRows,
  hasSubsections,
  termSections,
  sectionsTotalMax,
  cancelPendingLoad,
}: {
  form: { classId: string; subject: string; examType: string };
  rows: StudentRow[];
  setRows: (updater: StudentRow[] | ((prev: StudentRow[]) => StudentRow[])) => void;
  hasSubsections: boolean;
  termSections: ExamTypeSectionOption[];
  sectionsTotalMax: number;
  /** Drops any in-flight students/marks load so a stale response cannot clear marks after a save. */
  cancelPendingLoad: () => void;
}) {
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [savePopup, setSavePopup] = useState<SavedMarkRow[] | null>(null);

  const handleSaveAll = async () => {
    if (!form.classId || !form.subject || form.subject === "No subjects assigned") return;

    const filledRows = hasSubsections
      ? rows.filter((r) => {
          if (r.marks === "AB") return true;
          if (!r.componentScores) return false;
          return termSections.every((sec) => {
            const v = r.componentScores?.[sec.name];
            return v !== "" && v !== undefined;
          });
        })
      : rows.filter((r) => r.marks !== "");

    if (filledRows.length === 0) {
      setSaveMessage(
        hasSubsections
          ? "Enter all subsection marks (or mark Absent) before saving."
          : "Enter marks before saving."
      );
      return;
    }
    const missingMax = filledRows.some(
      (r) => r.maxMarks === "" || typeof r.maxMarks !== "number" || r.maxMarks <= 0
    );
    if (missingMax) {
      setSaveMessage("Set max marks before saving (cannot be empty).");
      return;
    }
    setSaveLoading(true);
    setSaveMessage("");
    cancelPendingLoad();
    try {
      const entries = filledRows.map((row) => {
        const isAbsent = row.marks === "AB";
        const totalMarks = hasSubsections ? sectionsTotalMax : (row.maxMarks as number);
        const components = hasSubsections
          ? termSections.map((sec) => ({
              name: sec.name,
              marks: isAbsent ? 0 : Number(row.componentScores?.[sec.name] ?? 0),
              totalMarks: sec.maxMarks,
            }))
          : undefined;
        const obtained = hasSubsections
          ? isAbsent
            ? 0
            : termSections.reduce((a, sec) => a + Number(row.componentScores?.[sec.name] ?? 0), 0)
          : isAbsent
            ? 0
            : Number(row.marks);
        return {
          studentId: row.id,
          marks: obtained,
          totalMarks,
          ...(isAbsent ? { grade: "AB" as const } : {}),
          ...(components ? { components } : {}),
        };
      });

      const res = await fetch("/api/marks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          classId: form.classId,
          subject: form.subject,
          examType: form.examType || null,
          entries,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveMessage(data?.message || "Failed to save marks.");
        return;
      }

      const savedRows: SavedMarkRow[] = Array.isArray(data?.saved) ? data.saved : [];
      const byStudent = new Map(savedRows.map((row) => [row.studentId, row]));
      setRows((prev) =>
        sortRowsSavedFirst(
          prev.map((row) => {
            const savedMark = byStudent.get(row.id);
            if (!savedMark) return row;
            const isAbsent = savedMark.grade === "AB";
            const componentScores: Record<string, number | "" | "AB"> | undefined =
              hasSubsections
                ? Object.fromEntries(
                    termSections.map((sec) => {
                      const saved = savedMark.components?.find(
                        (c) => c.name.toUpperCase() === sec.name.toUpperCase()
                      );
                      if (isAbsent) return [sec.name, "AB" as const];
                      return [sec.name, saved ? Number(saved.marks) : ("" as const)];
                    })
                  )
                : undefined;
            return {
              ...row,
              name: savedMark.studentName || row.name,
              marks: isAbsent ? ("AB" as const) : Number(savedMark.marks),
              maxMarks: savedMark.totalMarks,
              markId: savedMark.id,
              componentScores,
            };
          })
        )
      );
      setSavePopup(savedRows);
      setSaveMessage("Successfully saved");
    } finally {
      setSaveLoading(false);
    }
  };

  return { saveLoading, saveMessage, setSaveMessage, savePopup, setSavePopup, handleSaveAll };
}
