import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { peekTeacherMarksClasses } from "@/lib/teacher/loadTeacherFastTabs";
import { resolveMarkSetup } from "@/lib/exams/examTypes";
import type { MarkApi, StudentApi, StudentRow } from "./types";
import { useMarksEntryColumns } from "./useMarksEntryColumns";
import { sortRowsSavedFirst, useMarksSaveAll } from "./useMarksSaveAll";
import { useMarksClassesMetadata } from "./useMarksClassesMetadata";
import { useMarksRowMutators } from "./useMarksRowMutators";

/**
 * All state, effects, and handlers for the marks-entry sub-tab of Marks.tsx.
 * Verbatim relocation of the original component body — same order, same
 * closures, same dependency arrays — only the final `return` is new.
 *
 * Classes/subject/exam-type metadata loading and row-value mutators were
 * split into useMarksClassesMetadata and useMarksRowMutators (both plain
 * domain hooks); fetchStudentsAndMarks stays here because it and
 * useMarksSaveAll (further below) each need the other — pulling it out
 * would require an indirection layer for little benefit.
 */
export function useMarksEntryState() {
  const [subTab, setSubTab] = useState<"entry" | "report-card" | "download">("entry");
  const initialClasses = peekTeacherMarksClasses();
  const [form, setForm] = useState<{
    classId: string;
    classLabel: string;
    section: string;
    subject: string;
    examType: string;
    maxMarks: number | "";
  }>(() => {
    const first = initialClasses?.[0];
    return {
      classId: first?.id ?? "",
      classLabel: first
        ? first.section
          ? `${first.name} - ${first.section}`
          : first.name
        : "",
      section: first?.section || "Section A",
      subject: "",
      examType: "TERM 1",
      maxMarks: 100,
    };
  });
  const [activeBtn, setActiveBtn] = useState<null | "save" | "import" | "export">(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const userSelectedClassRef = useRef(false);
  const userSelectedExamTypeRef = useRef(false);
  /** Bumped on every load and on save; a load only applies if its number is still current. */
  const fetchSeqRef = useRef(0);

  const {
    classes,
    classesLoading,
    subjectOptions,
    subjectsLoading,
    examTypeCatalog,
    examTypeOptions,
    setExamTypeOptions,
  } = useMarksClassesMetadata({
    initialClasses,
    form,
    setForm,
    userSelectedClassRef,
    userSelectedExamTypeRef,
  });

  const markSetup = useMemo(
    () => resolveMarkSetup(examTypeCatalog, form.examType, form.subject),
    [examTypeCatalog, form.examType, form.subject]
  );
  const termSections = markSetup.sections;
  const configuredMaxMarks = markSetup.maxMarks;
  const hasSubsections = termSections.length > 0;
  const sectionsTotalMax = termSections.reduce((a, s) => a + s.maxMarks, 0);
  const maxMarksLocked =
    hasSubsections ||
    (configuredMaxMarks != null && configuredMaxMarks > 0);

  const classOptions = classes.map((c) => ({
    value: c.id,
    label: c.section ? `${c.name} - ${c.section}` : c.name,
  }));
  const sectionOptions = form.classId
    ? (() => {
        const c = classes.find((x) => x.id === form.classId);
        if (c?.section) return [c.section];
        return ["Section A"];
      })()
    : ["Section A"];

  const fetchStudentsAndMarks = useCallback(async () => {
    if (!form.classId || !form.subject) {
      setRows([]);
      return;
    }
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        classId: form.classId,
        subject: form.subject,
      });
      if (form.examType) {
        params.append("examType", form.examType);
      }

      const [studentsRes, marksRes] = await Promise.all([
        fetch(`/api/class/students?classId=${encodeURIComponent(form.classId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/marks/view?${params.toString()}`, {
          cache: "no-store",
        }),
      ]);
      const studentsData = await studentsRes.json();
      const marksData = await marksRes.json();
      const students: StudentApi[] = Array.isArray(studentsData.students) ? studentsData.students : [];
      if (seq !== fetchSeqRef.current) return;

      const marks: MarkApi[] = Array.isArray(marksData.marks) ? marksData.marks : [];
      const examTypesInUse: string[] = Array.isArray(marksData.examTypesInUse)
        ? marksData.examTypesInUse.map((t: string) => String(t).trim().toUpperCase()).filter(Boolean)
        : [];
      const latestExamType =
        typeof marksData.latestExamType === "string"
          ? marksData.latestExamType.trim().toUpperCase()
          : "";

      if (examTypesInUse.length > 0) {
        setExamTypeOptions((prev) => Array.from(new Set([...examTypesInUse, ...prev])));
      }

      // If this exam type has no saved marks but another does, switch to the latest saved exam
      // (unless the teacher manually picked the exam type).
      const currentExam = (form.examType || "").trim().toUpperCase();
      if (
        marks.length === 0 &&
        latestExamType &&
        latestExamType !== currentExam &&
        !userSelectedExamTypeRef.current
      ) {
        setForm((prev) => ({ ...prev, examType: latestExamType }));
        return;
      }

      const markByStudent: Record<string, MarkApi> = {};
      for (const m of marks) {
        const existing = markByStudent[m.studentId];
        if (!existing || m.createdAt > existing.createdAt) {
          markByStudent[m.studentId] = m;
        }
      }

      // Restore max marks from what was previously saved (not the UI default of 100)
      const savedMarksList = Object.values(markByStudent).sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      );
      const latestTotal = savedMarksList.find(
        (m) => typeof m.totalMarks === "number" && m.totalMarks > 0
      )?.totalMarks;
      // Prefer subject or exam-type settings, else what was already saved
      const lockedMax =
        termSections.length > 0
          ? termSections.reduce((a, s) => a + s.maxMarks, 0)
          : configuredMaxMarks;
      const defaultMax =
        lockedMax != null && lockedMax > 0
          ? lockedMax
          : latestTotal ??
            (typeof form.maxMarks === "number" && form.maxMarks > 0 ? form.maxMarks : 100);
      if (lockedMax != null && lockedMax > 0) {
        setForm((prev) =>
          prev.maxMarks === lockedMax ? prev : { ...prev, maxMarks: lockedMax }
        );
      } else if (latestTotal) {
        setForm((prev) =>
          prev.maxMarks === defaultMax ? prev : { ...prev, maxMarks: defaultMax }
        );
      }

      if (seq !== fetchSeqRef.current) return;

      const newRows: StudentRow[] = students
        .map((s) => {
          const name = s.user?.name ?? "Student";
          const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=40&background=4ade80&color=fff`;
          const mark = markByStudent[s.id];
          const isAbsent = mark?.grade === "AB";
          const rowMax =
            termSections.length > 0
              ? defaultMax
              : mark && typeof mark.totalMarks === "number" && mark.totalMarks > 0
                ? mark.totalMarks
                : defaultMax;

          const componentScores: Record<string, number | "" | "AB"> = {};
          if (termSections.length > 0) {
            for (const sec of termSections) {
              const saved = mark?.components?.find(
                (c) => c.name.toUpperCase() === sec.name.toUpperCase()
              );
              if (isAbsent) {
                componentScores[sec.name] = "AB";
              } else if (saved) {
                componentScores[sec.name] = Number(saved.marks);
              } else {
                componentScores[sec.name] = "";
              }
            }
          }

          return {
            id: s.id,
            rollNo: s.rollNo ?? "--",
            name,
            avatar: s.user?.photoUrl?.trim() || fallbackAvatar,
            marks: mark ? (isAbsent ? ("AB" as const) : Number(mark.marks)) : ("" as const),
            maxMarks: rowMax,
            markId: mark?.id,
            componentScores: termSections.length > 0 ? componentScores : undefined,
          };
        })
      setRows(sortRowsSavedFirst(newRows));
      setEditingMaxId(null);
      setSaveMessage("");
    } catch {
      if (seq === fetchSeqRef.current) setRows([]);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.maxMarks intentionally excluded (matches original); setSaveMessage is a stable setter
  }, [form.classId, form.subject, form.examType, markSetup, configuredMaxMarks, termSections]);

  useEffect(() => {
    fetchStudentsAndMarks();
  }, [fetchStudentsAndMarks]);

  // Scrolling over a focused number input must not change its value; scroll the page instead.
  const marksTableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = marksTableRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "number") return;
      event.preventDefault();
      const scroller = root.closest("main");
      scroller?.scrollBy({ top: event.deltaY, left: 0 });
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  const handleChange = (key: string, value: string) => {
    if (key === "examType") {
      userSelectedExamTypeRef.current = true;
      const nextType = value.toUpperCase();
      const locked = resolveMarkSetup(examTypeCatalog, nextType, form.subject).maxMarks;
      setForm((prev) => ({
        ...prev,
        examType: nextType,
        maxMarks: locked != null && locked > 0 ? locked : prev.maxMarks,
      }));
      if (locked != null && locked > 0) {
        setRows((prev) =>
          prev.map((r) => {
            const marks = r.marks;
            const nextMarks =
              typeof marks === "number" && marks > locked ? locked : marks;
            return { ...r, maxMarks: locked, marks: nextMarks };
          })
        );
      }
      return;
    }
    if (key === "class") {
      if (!value || value === "Select class") {
        userSelectedClassRef.current = false;
        userSelectedExamTypeRef.current = false;
        setForm((prev) => ({ ...prev, classId: "", classLabel: "", section: "" }));
        return;
      }
      userSelectedClassRef.current = true;
      userSelectedExamTypeRef.current = false;
      const opt = classOptions.find((o) => o.value === value || o.label === value);
      const c = classes.find((x) => x.id === value || (x.section ? `${x.name} - ${x.section}` : x.name) === value);
      setForm((prev) => ({
        ...prev,
        classId: opt?.value ?? "",
        classLabel: opt?.label ?? value,
        section: c?.section ?? prev.section,
      }));
      return;
    }
    if (key === "section") {
      setForm((prev) => ({ ...prev, section: value }));
      return;
    }
    if (key === "subject") {
      userSelectedExamTypeRef.current = false;
      const locked = resolveMarkSetup(examTypeCatalog, form.examType, value).maxMarks;
      setForm((prev) => ({
        ...prev,
        subject: value,
        maxMarks: locked != null && locked > 0 ? locked : prev.maxMarks,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const {
    editingMaxId,
    setEditingMaxId,
    editingMaxValue,
    setEditingMaxValue,
    updateMarks,
    updateComponentScore,
    toggleAbsent,
    updateMaxMarks,
    startEditMaxMarks,
    commitEditMaxMarks,
    getPercentage,
    getGrade,
    total,
    entered,
    absentCount,
    pending,
  } = useMarksRowMutators({
    rows,
    setRows,
    setForm,
    termSections,
    hasSubsections,
    sectionsTotalMax,
    maxMarksLocked,
  });

  const { saveLoading, saveMessage, setSaveMessage, savePopup, setSavePopup, handleSaveAll } =
    useMarksSaveAll({
      form,
      rows,
      setRows,
      hasSubsections,
      termSections,
      sectionsTotalMax,
      cancelPendingLoad: () => {
        fetchSeqRef.current += 1;
        setLoading(false);
      },
    });

  const { columns } = useMarksEntryColumns({
    hasSubsections,
    termSections,
    updateComponentScore,
    updateMarks,
    toggleAbsent,
    editingMaxId,
    maxMarksLocked,
    editingMaxValue,
    setEditingMaxValue,
    setEditingMaxId,
    commitEditMaxMarks,
    startEditMaxMarks,
    getPercentage,
    getGrade,
  });

  const displayClass = form.classLabel || form.classId || "Select class";
  const displaySection = form.section || "Section A";

  return {
    subTab,
    setSubTab,
    classesLoading,
    classes,
    subjectsLoading,
    subjectOptions,
    form,
    handleChange,
    classOptions,
    sectionOptions,
    examTypeOptions,
    maxMarksLocked,
    markSetup,
    hasSubsections,
    termSections,
    sectionsTotalMax,
    updateMaxMarks,
    updateComponentScore,
    marksTableRef,
    savePopup,
    setSavePopup,
    activeBtn,
    setActiveBtn,
    loading,
    columns,
    rows,
    updateMarks,
    toggleAbsent,
    editingMaxId,
    setEditingMaxId,
    editingMaxValue,
    setEditingMaxValue,
    commitEditMaxMarks,
    startEditMaxMarks,
    getPercentage,
    getGrade,
    total,
    entered,
    absentCount,
    pending,
    saveMessage,
    saveLoading,
    handleSaveAll,
    displayClass,
    displaySection,
  };
}
