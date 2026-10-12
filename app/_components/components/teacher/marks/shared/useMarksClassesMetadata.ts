import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import {
  loadTeacherMarksClasses,
  peekTeacherMarksClasses,
} from "@/lib/teacher/loadTeacherFastTabs";
import {
  normalizeExamTypes,
  maxMarksForExamType,
  type ExamTypeOption,
} from "@/lib/exams/examTypes";
import type { ClassOption, MarksEntryForm } from "./types";
import { DEFAULT_EXAM_TYPES, mapLiteClasses, uniqueSubjects } from "./utils";

export function useMarksClassesMetadata({
  initialClasses,
  form,
  setForm,
  userSelectedClassRef,
  userSelectedExamTypeRef,
}: {
  initialClasses: ReturnType<typeof peekTeacherMarksClasses>;
  form: MarksEntryForm;
  setForm: React.Dispatch<React.SetStateAction<MarksEntryForm>>;
  userSelectedClassRef: MutableRefObject<boolean>;
  userSelectedExamTypeRef: MutableRefObject<boolean>;
}) {
  const [classes, setClasses] = useState<ClassOption[]>(() =>
    initialClasses ? mapLiteClasses(initialClasses) : []
  );
  const [classesLoading, setClassesLoading] = useState(() => !initialClasses);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [examTypeCatalog, setExamTypeCatalog] = useState<ExamTypeOption[]>(
    DEFAULT_EXAM_TYPES.map((name) => ({ name, maxMarks: null, sections: [] }))
  );
  const [examTypeOptions, setExamTypeOptions] =
    useState<string[]>(DEFAULT_EXAM_TYPES);

  const fetchClasses = useCallback(async () => {
    const cached = peekTeacherMarksClasses();
    if (cached?.length) {
      setClasses(mapLiteClasses(cached));
      setClassesLoading(false);
      setForm((prev) => {
        if (userSelectedClassRef.current && prev.classId) return prev;
        if (prev.classId) return prev;
        const first = cached[0];
        return {
          ...prev,
          classId: first.id,
          classLabel: first.section ? `${first.name} - ${first.section}` : first.name,
          section: first.section || "Section A",
        };
      });
    } else {
      setClassesLoading(true);
    }

    try {
      const list = await loadTeacherMarksClasses({ revalidate: true });
      setClasses(mapLiteClasses(list));
      setForm((prev) => {
        if (userSelectedClassRef.current && prev.classId) return prev;
        const stillValid = list.some((c) => c.id === prev.classId);
        if (stillValid) return prev;
        if (list.length === 0) {
          return { ...prev, classId: "", classLabel: "", section: "" };
        }
        const first = list[0];
        return {
          ...prev,
          classId: first.id,
          classLabel: first.section ? `${first.name} - ${first.section}` : first.name,
          section: first.section || "Section A",
        };
      });
    } catch {
      if (!peekTeacherMarksClasses()?.length) setClasses([]);
    } finally {
      setClassesLoading(false);
    }
  }, [setForm, userSelectedClassRef]);

  const fetchMetadata = useCallback(async (classId: string) => {
    setSubjectsLoading(true);
    try {
      const [examTypesRes, meRes, termsRes] = await Promise.all([
        fetch("/api/exam-types", { cache: "no-store" }).catch(() => null),
        fetch("/api/user/me", { cache: "no-store", credentials: "include" }).catch(() => null),
        fetch(`/api/exams/terms?${classId ? `classId=${classId}` : ""}`, {
          cache: "no-store",
          credentials: "include",
        }).catch(() => null),
      ]);

      const allExamNames = new Set<string>();

      if (examTypesRes?.ok) {
        const data = await examTypesRes.json().catch(() => ({}));
        const catalog = normalizeExamTypes(data.examTypes);
        if (catalog.length > 0) {
          setExamTypeCatalog(catalog);
          catalog.forEach((t) => allExamNames.add(t.name));
        }
      }

      if (termsRes?.ok) {
        const data = await termsRes.json().catch(() => ({}));
        const exams = Array.isArray(data.exams) ? data.exams : [];
        exams.forEach((exam: { name?: string }) => {
          if (exam.name?.trim()) allExamNames.add(exam.name.trim().toUpperCase());
        });
      }

      if (allExamNames.size > 0) {
        setExamTypeOptions((prev) => Array.from(new Set([...allExamNames, ...prev])));
        setForm((prev) =>
          allExamNames.has(prev.examType) || userSelectedExamTypeRef.current
            ? prev
            : { ...prev, examType: Array.from(allExamNames)[0] }
        );
      }

      let teacherSubjects: string[] = [];
      if (meRes?.ok) {
        const data = await meRes.json().catch(() => ({}));
        const user = data?.user;
        const fromList = Array.isArray(user?.subjects) ? user.subjects : [];
        const primary = typeof user?.subject === "string" ? user.subject : "";
        teacherSubjects = uniqueSubjects([...fromList, primary].filter(Boolean));
      }

      setSubjectOptions(teacherSubjects);
      setForm((prev) => {
        if (teacherSubjects.length === 0) {
          return { ...prev, subject: "" };
        }
        const match = teacherSubjects.find(
          (s) => s.replace(/\s+/g, " ").toUpperCase() === prev.subject.replace(/\s+/g, " ").toUpperCase()
        );
        return match ? { ...prev, subject: match } : { ...prev, subject: teacherSubjects[0] };
      });
    } finally {
      setSubjectsLoading(false);
    }
  }, [setForm, userSelectedExamTypeRef]);

  useEffect(() => {
    fetchClasses();
    fetchMetadata(initialClasses?.[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const locked = maxMarksForExamType(examTypeCatalog, form.examType);
    if (locked != null && locked > 0) {
      setForm((prev) =>
        prev.maxMarks === locked ? prev : { ...prev, maxMarks: locked }
      );
    }
  }, [examTypeCatalog, form.examType, setForm]);

  return {
    classes,
    classesLoading,
    subjectOptions,
    subjectsLoading,
    examTypeCatalog,
    examTypeOptions,
    setExamTypeOptions,
  };
}
