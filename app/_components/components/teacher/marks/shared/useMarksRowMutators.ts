import { useState } from "react";
import type { MarksEntryForm, StudentRow } from "./types";

export function useMarksRowMutators({
  rows,
  setRows,
  setForm,
  termSections,
  hasSubsections,
  sectionsTotalMax,
  maxMarksLocked,
}: {
  rows: StudentRow[];
  setRows: React.Dispatch<React.SetStateAction<StudentRow[]>>;
  setForm: React.Dispatch<React.SetStateAction<MarksEntryForm>>;
  termSections: Array<{ name: string; maxMarks: number }>;
  hasSubsections: boolean;
  sectionsTotalMax: number;
  maxMarksLocked: boolean;
}) {
  const [editingMaxId, setEditingMaxId] = useState<string | null>(null);
  const [editingMaxValue, setEditingMaxValue] = useState("");

  const updateMarks = (id: string, value: string) => {
    const num = value === "" ? "" : Math.min(1000, Math.max(0, Number(value)));
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, marks: num } : r)));
  };

  const updateComponentScore = (studentId: string, sectionName: string, value: string) => {
    const section = termSections.find((s) => s.name === sectionName);
    const max = section?.maxMarks ?? 1000;
    const num =
      value === ""
        ? ("" as const)
        : Math.min(max, Math.max(0, Number(value)));

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== studentId) return r;
        const nextScores = { ...(r.componentScores || {}), [sectionName]: num };
        let total: number | "" | "AB" = 0;
        let allEmpty = true;
        let anyAb = false;
        for (const sec of termSections) {
          const v = nextScores[sec.name];
          if (v === "AB") anyAb = true;
          if (v !== "" && v !== undefined) allEmpty = false;
          if (typeof v === "number") total = (typeof total === "number" ? total : 0) + v;
        }
        if (anyAb && allEmpty === false) {
          // keep numeric total from non-AB parts; AB on one section still allows others
        }
        return {
          ...r,
          componentScores: nextScores,
          marks: allEmpty ? ("" as const) : (total as number),
          maxMarks: sectionsTotalMax || r.maxMarks,
        };
      })
    );
  };

  const toggleAbsent = (id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const goingAbsent = r.marks !== "AB";
        if (hasSubsections) {
          const nextScores: Record<string, number | "" | "AB"> = {};
          for (const sec of termSections) {
            nextScores[sec.name] = goingAbsent ? "AB" : "";
          }
          return {
            ...r,
            marks: goingAbsent ? ("AB" as const) : ("" as const),
            componentScores: nextScores,
            maxMarks: sectionsTotalMax || r.maxMarks,
          };
        }
        return { ...r, marks: goingAbsent ? ("AB" as const) : ("" as const) };
      })
    );
  };

  const updateMaxMarks = (value: string) => {
    if (maxMarksLocked) return;
    // Allow fully clearing the field — applies to all students
    if (value.trim() === "") {
      setForm((prev) => ({ ...prev, maxMarks: "" }));
      setRows((prev) => prev.map((r) => ({ ...r, maxMarks: "" as const })));
      setEditingMaxId(null);
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const num = Math.min(1000, Math.max(1, parsed));
    setForm((prev) => ({ ...prev, maxMarks: num }));
    setRows((prev) =>
      prev.map((r) => {
        const nextMarks =
          r.marks !== "" && r.marks !== "AB" && Number(r.marks) > num ? num : r.marks;
        return { ...r, maxMarks: num, marks: nextMarks };
      })
    );
    setEditingMaxId(null);
  };

  const updateRowMaxMarks = (id: string, value: string) => {
    if (value.trim() === "") {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, maxMarks: "" as const } : r)));
      return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const num = Math.min(1000, Math.max(1, parsed));
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const nextMarks =
          r.marks !== "" && r.marks !== "AB" && Number(r.marks) > num ? num : r.marks;
        return { ...r, maxMarks: num, marks: nextMarks };
      })
    );
    setForm((prev) => ({ ...prev, maxMarks: num }));
  };

  const startEditMaxMarks = (id: string, current: number | "") => {
    if (maxMarksLocked) return;
    setEditingMaxId(id);
    setEditingMaxValue(current === "" ? "" : String(current));
  };

  const commitEditMaxMarks = (id: string) => {
    updateRowMaxMarks(id, editingMaxValue);
    setEditingMaxId(null);
    setEditingMaxValue("");
  };

  const getPercentage = (m: number | "" | "AB", max: number | "") =>
    m === "" || max === "" || max <= 0
      ? "--"
      : m === "AB"
        ? "Absent"
        : `${((Number(m) / max) * 100).toFixed(1)}%`;

  const getGrade = (m: number | "" | "AB", max: number | "") => {
    if (m === "AB") return "AB";
    if (m === "" || max === "" || max <= 0) return "--";
    const pct = (Number(m) / max) * 100;
    if (pct >= 90) return "A+";
    if (pct >= 80) return "A";
    if (pct >= 70) return "B+";
    if (pct >= 60) return "B";
    return "C";
  };

  const total = rows.length;
  const entered = rows.filter((r) => {
    if (hasSubsections) {
      if (r.marks === "AB") return true;
      return termSections.every((sec) => {
        const v = r.componentScores?.[sec.name];
        return v !== "" && v !== undefined;
      });
    }
    return r.marks !== "";
  }).length;
  const absentCount = rows.filter((r) => r.marks === "AB").length;
  const pending = total - entered;

  return {
    editingMaxId,
    setEditingMaxId,
    editingMaxValue,
    setEditingMaxValue,
    updateMarks,
    updateComponentScore,
    toggleAbsent,
    updateMaxMarks,
    updateRowMaxMarks,
    startEditMaxMarks,
    commitEditMaxMarks,
    getPercentage,
    getGrade,
    total,
    entered,
    absentCount,
    pending,
  };
}
