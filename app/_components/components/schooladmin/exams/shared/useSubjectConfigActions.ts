import { useEffect, useState } from "react";
import type {
  ExamTypeOption,
  ExamTypeSectionOption,
  ExamTypeSubjectConfig,
} from "@/lib/exams/examTypes";

export type SubjectPartDraft = { name: string; maxMarks: string };

/** Key for one subject under one exam type, e.g. "TERM 1::MATHEMATICS". */
export const subjectMaxKey = (examTypeName: string, subjectName: string) =>
  `${examTypeName.trim().toUpperCase()}::${subjectName.trim().toUpperCase()}`;

type SavedSubjectConfig = {
  subject: string;
  maxMarks?: number | null;
  sections?: ExamTypeSectionOption[];
};

function upsertSubjectConfig(
  examTypes: ExamTypeOption[],
  examTypeName: string,
  saved: SavedSubjectConfig,
  sections: ExamTypeSectionOption[]
): ExamTypeOption[] {
  return examTypes.map((t) => {
    if (t.name !== examTypeName) return t;
    const configs = [...(t.subjectConfigs ?? [])];
    const idx = configs.findIndex((c) => c.subject === saved.subject);
    const row: ExamTypeSubjectConfig = {
      subject: saved.subject,
      maxMarks: saved.maxMarks ?? null,
      sections,
    };
    if (idx >= 0) configs[idx] = row;
    else configs.push(row);
    configs.sort((a, b) => a.subject.localeCompare(b.subject));
    return { ...t, subjectConfigs: configs };
  });
}

/**
 * Per-subject max marks and parts (Written / Viva) under each exam type.
 * `examTypes` is owned by the exams cache reducer (see useExamsTabState);
 * saves write back through `setExamTypes`.
 */
export function useSubjectConfigActions(
  examTypes: ExamTypeOption[],
  setExamTypes: (next: ExamTypeOption[]) => void,
  subjects: string[]
) {
  const [subjectMaxByExam, setSubjectMaxByExam] = useState<Record<string, string>>({});
  const [subjectPartsByKey, setSubjectPartsByKey] = useState<Record<string, SubjectPartDraft[]>>({});
  const [subjectConfigSavingFor, setSubjectConfigSavingFor] = useState<string | null>(null);
  const [subjectConfigMessage, setSubjectConfigMessage] = useState("");
  const [openExamType, setOpenExamType] = useState<string | null>(null);

  // Seed drafts from saved configs for any exam type x subject pair not seen yet.
  useEffect(() => {
    setSubjectMaxByExam((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const exam of examTypes) {
        for (const subject of subjects) {
          const key = subjectMaxKey(exam.name, subject);
          if (key in next) continue;
          const saved = exam.subjectConfigs?.find((c) => c.subject === subject.trim().toUpperCase());
          next[key] = saved?.sections?.length
            ? String(saved.sections.reduce((a, s) => a + s.maxMarks, 0))
            : saved?.maxMarks != null
              ? String(saved.maxMarks)
              : "";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setSubjectPartsByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const exam of examTypes) {
        for (const subject of subjects) {
          const key = subjectMaxKey(exam.name, subject);
          if (key in next) continue;
          const saved = exam.subjectConfigs?.find((c) => c.subject === subject.trim().toUpperCase());
          next[key] = (saved?.sections ?? []).map((s) => ({
            name: s.name,
            maxMarks: String(s.maxMarks),
          }));
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [examTypes, subjects]);

  /** Drop the drafts for one subject under one exam type. */
  const dropDraftsForExamSubject = (rowKey: string) => {
    setSubjectMaxByExam((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    setSubjectPartsByKey((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  };

  /** Drop the drafts for a subject under every exam type. */
  const dropDraftsForSubject = (upperName: string) => {
    const prune = <T,>(prev: Record<string, T>) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.endsWith(`::${upperName}`)) delete next[key];
      }
      return next;
    };
    setSubjectMaxByExam(prune);
    setSubjectPartsByKey(prune);
  };

  /** Move the drafts of a renamed subject to its new name. */
  const renameDraftsForSubject = (fromName: string, toName: string) => {
    const remapKey = (key: string) =>
      key.endsWith(`::${fromName}`) ? `${key.slice(0, -fromName.length)}${toName}` : key;
    const remap = <T,>(prev: Record<string, T>) => {
      const next: Record<string, T> = {};
      for (const [key, value] of Object.entries(prev)) next[remapKey(key)] = value;
      return next;
    };
    setSubjectMaxByExam(remap);
    setSubjectPartsByKey(remap);
  };

  const putSubjectConfig = async (body: Record<string, unknown>, failMessage: string) => {
    const res = await fetch("/api/exam-types/subject-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const saved = data?.subjectConfig as SavedSubjectConfig | undefined;
    if (!res.ok || !saved?.subject) {
      setSubjectConfigMessage(data?.message || failMessage);
      return null;
    }
    return { data, saved };
  };

  const saveSubjectMax = async (examTypeName: string, subjectName: string) => {
    const upper = examTypeName.trim().toUpperCase();
    const subject = subjectName.trim().toUpperCase();
    const key = subjectMaxKey(upper, subject);
    const exam = examTypes.find((t) => t.name === upper);
    const already = exam?.subjectConfigs?.find((c) => c.subject === subject);
    if (already && already.sections.length > 0) {
      setSubjectConfigMessage(
        `${subject} under ${upper} uses subsection max marks. Those were not changed.`
      );
      return;
    }
    const maxRaw = (subjectMaxByExam[key] ?? "").trim();
    const maxMarks = Number(maxRaw);
    if (!maxRaw || !Number.isFinite(maxMarks) || maxMarks <= 0) {
      setSubjectConfigMessage(`Set max marks for ${subject}`);
      return;
    }
    if (already?.maxMarks != null && Number(already.maxMarks) === maxMarks) {
      setSubjectConfigMessage(`${subject} already has max marks ${maxMarks} for ${upper}.`);
      return;
    }

    setSubjectConfigMessage("");
    setSubjectConfigSavingFor(key);
    try {
      const result = await putSubjectConfig(
        { examType: upper, subject, maxMarks },
        "Failed to save max marks"
      );
      if (!result) return;
      const { data, saved } = result;
      setExamTypes(
        upsertSubjectConfig(
          examTypes,
          upper,
          saved,
          Array.isArray(saved.sections) ? saved.sections : already?.sections ?? []
        )
      );
      setSubjectMaxByExam((prev) => ({
        ...prev,
        [key]: saved.maxMarks != null ? String(saved.maxMarks) : maxRaw,
      }));
      setSubjectConfigMessage(
        data?.unchanged ? data.message : `Saved ${saved.subject} max marks for ${upper}`
      );
    } catch (e) {
      console.error(e);
      setSubjectConfigMessage("Failed to save max marks");
    } finally {
      setSubjectConfigSavingFor(null);
    }
  };

  /** All parts removed: store the plain max marks and clear the saved parts. */
  const clearSubjectParts = async (upper: string, subject: string, key: string) => {
    const maxRaw = (subjectMaxByExam[key] ?? "").trim();
    const maxMarks = Number(maxRaw);
    if (!maxRaw || !Number.isFinite(maxMarks) || maxMarks <= 0) {
      setSubjectConfigMessage(`Set max marks for ${subject}, or add Written / Viva parts`);
      return;
    }
    setSubjectConfigMessage("");
    setSubjectConfigSavingFor(key);
    try {
      const result = await putSubjectConfig(
        { examType: upper, subject, maxMarks, sections: [] },
        "Failed to save max marks"
      );
      if (!result) return;
      setExamTypes(upsertSubjectConfig(examTypes, upper, result.saved, []));
      setSubjectConfigMessage(`Saved ${result.saved.subject} max marks for ${upper}`);
    } catch (e) {
      console.error(e);
      setSubjectConfigMessage("Failed to save max marks");
    } finally {
      setSubjectConfigSavingFor(null);
    }
  };

  const saveSubjectParts = async (examTypeName: string, subjectName: string) => {
    const upper = examTypeName.trim().toUpperCase();
    const subject = subjectName.trim().toUpperCase();
    const key = subjectMaxKey(upper, subject);
    const drafts = subjectPartsByKey[key] ?? [];
    const exam = examTypes.find((t) => t.name === upper);
    const already = exam?.subjectConfigs?.find((c) => c.subject === subject);

    if (drafts.length === 0) {
      if (!already || already.sections.length === 0) {
        await saveSubjectMax(upper, subject);
        return;
      }
      await clearSubjectParts(upper, subject, key);
      return;
    }
    for (const row of drafts) {
      if (!row.name.trim()) {
        setSubjectConfigMessage(`Each part of ${subject} needs a name, such as Written or Viva`);
        return;
      }
      const n = Number(row.maxMarks);
      if (!Number.isFinite(n) || n <= 0) {
        setSubjectConfigMessage(`"${row.name || "Part"}" needs marks`);
        return;
      }
    }
    const same =
      already &&
      already.sections.length === drafts.length &&
      drafts.every((row, i) => {
        const saved = already.sections[i];
        return (
          saved &&
          saved.name.trim().toUpperCase() === row.name.trim().toUpperCase() &&
          Number(saved.maxMarks) === Number(row.maxMarks)
        );
      });
    if (same) {
      setSubjectConfigMessage(`${subject} parts for ${upper} are already saved.`);
      return;
    }

    setSubjectConfigMessage("");
    setSubjectConfigSavingFor(key);
    try {
      const result = await putSubjectConfig(
        {
          examType: upper,
          subject,
          sections: drafts.map((row, i) => ({
            name: row.name.trim(),
            maxMarks: Number(row.maxMarks),
            order: i,
          })),
        },
        "Failed to save subject parts"
      );
      if (!result) return;
      const { data, saved } = result;
      const sections = Array.isArray(saved.sections) ? saved.sections : [];
      setExamTypes(upsertSubjectConfig(examTypes, upper, saved, sections));
      setSubjectPartsByKey((prev) => ({
        ...prev,
        [key]: sections.map((s) => ({ name: s.name, maxMarks: String(s.maxMarks) })),
      }));
      setSubjectConfigMessage(
        data?.unchanged ? data.message : `Saved ${saved.subject} for ${upper}`
      );
    } catch (e) {
      console.error(e);
      setSubjectConfigMessage("Failed to save subject parts");
    } finally {
      setSubjectConfigSavingFor(null);
    }
  };

  return {
    subjectMaxByExam,
    setSubjectMaxByExam,
    subjectPartsByKey,
    setSubjectPartsByKey,
    subjectConfigSavingFor,
    subjectConfigMessage,
    openExamType,
    setOpenExamType,
    saveSubjectMax,
    saveSubjectParts,
    dropDraftsForExamSubject,
    dropDraftsForSubject,
    renameDraftsForSubject,
  };
}
