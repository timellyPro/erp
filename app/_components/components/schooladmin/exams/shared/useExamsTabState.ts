import { useEffect, useState, useMemo, useReducer, useRef } from "react";
import {
  invalidateExamsPage,
  loadExamsPage,
  peekExamsPage,
  setExamsPageCache,
} from "@/lib/school/loadSchoolAdminFastTabs";
import type { ClassData, TermData } from "./types";
import {
  examsCacheReducer,
  initialExamsCacheState,
} from "./examsCacheReducer";
import { useExamTypeActions } from "./useExamTypeActions";
import { useSubjectActions } from "./useSubjectActions";
import { useSubjectConfigActions } from "./useSubjectConfigActions";

/**
 * All state, effects, and handlers for ExamsTab (exams.tsx).
 *
 * terms/classes/examTypes/subjects — the four fields the shared fast-tab
 * cache needs — live together in one reducer (examsCacheReducer) instead
 * of being split across this hook and its two sibling hooks with a
 * `getSnapshot` callback threaded between them to read each other's
 * latest values. Every update goes through `dispatch`, and a single
 * effect below keeps the fast-tab cache in sync with that one source of
 * truth, so no mutator needs to know about the cache at all.
 */
export function useExamsTabState() {
  const [cache, dispatch] = useReducer(examsCacheReducer, initialExamsCacheState);
  const { terms: rawData, classes, examTypes, subjects, removedByExam } = cache;

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedTermName, setSelectedTermName] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showAllSchedules, setShowAllSchedules] = useState(false);

  const setExamTypes = (next: typeof examTypes) =>
    dispatch({ type: "SET_EXAM_TYPES", payload: next });
  const setSubjects = (next: string[]) =>
    dispatch({ type: "SET_SUBJECTS", payload: next });

  const setRemovedByExam = (next: Record<string, string[]>) =>
    dispatch({ type: "SET_REMOVED_BY_EXAM", payload: next });

  const examTypeActions = useExamTypeActions(examTypes, setExamTypes);
  const subjectConfigActions = useSubjectConfigActions(examTypes, setExamTypes, subjects);
  const subjectActions = useSubjectActions(subjects, setSubjects, {
    examTypes,
    setExamTypes,
    removedByExam,
    setRemovedByExam,
    dropDraftsForExamSubject: subjectConfigActions.dropDraftsForExamSubject,
    dropDraftsForSubject: subjectConfigActions.dropDraftsForSubject,
    renameDraftsForSubject: subjectConfigActions.renameDraftsForSubject,
  });

  const { setExamTypesLoading, setExamTypeError, syncMaxDrafts } = examTypeActions;
  const { setSubjectsLoading, setSubjectError } = subjectActions;

  // Keep the fast-tab cache in sync with this hook's single source of
  // truth. Skip the very first run so mounting doesn't clobber a cache
  // entry from a previous visit before the initial fetch below has had a
  // chance to read it.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setExamsPageCache(cache);
  }, [cache]);

  useEffect(() => {
    const applyPayload = (payload: {
      terms: unknown[];
      classes: unknown[];
      examTypes: typeof examTypes;
      subjects: string[];
      removedByExam?: Record<string, string[]>;
    }) => {
      const data = payload.terms as TermData[];
      const classData = payload.classes as ClassData[];
      dispatch({
        type: "SET_PAGE",
        payload: {
          terms: data,
          classes: classData,
          examTypes: payload.examTypes,
          subjects: payload.subjects,
          removedByExam: payload.removedByExam ?? {},
        },
      });
      syncMaxDrafts(payload.examTypes);
      setExamTypesLoading(false);
      setSubjectsLoading(false);

      if (!selectedClassId && classData.length > 0) {
        setSelectedClassId(classData[0].id);
      }

      if (!selectedTermName && data.length > 0) {
        const firstUpcoming = data.find((t) => t.status === "UPCOMING");
        setSelectedTermName(firstUpcoming ? firstUpcoming.name : data[0].name);
      }
    };

    const fetchExams = async (revalidate = false) => {
      if (!revalidate) {
        const cached = peekExamsPage();
        if (cached) {
          applyPayload(cached);
          setLoading(false);
          void fetchExams(true);
          return;
        }
      }

      try {
        setLoading(rawData.length === 0);
        setExamTypesLoading(examTypes.length === 0);
        setSubjectsLoading(subjects.length === 0);
        const payload = await loadExamsPage({ revalidate });
        applyPayload(payload);
      } catch (e) {
        console.error("Fetch failed", e);
        invalidateExamsPage();
        const message = e instanceof Error ? e.message : "Failed to load exams";
        setExamTypeError(message);
        setSubjectError(message);
      } finally {
        setLoading(false);
        setExamTypesLoading(false);
        setSubjectsLoading(false);
      }
    };
    fetchExams();
    // syncMaxDrafts is a plain closure recreated every render (not a stable
    // setState setter) — intentionally omitted so this effect keeps firing
    // only on the primitive triggers below, matching the pre-split behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    examTypes.length,
    rawData.length,
    selectedClassId,
    selectedTermName,
    subjects.length,
    setExamTypesLoading,
    setSubjectsLoading,
    setExamTypeError,
    setSubjectError,
  ]);

  const filteredDataByClass = useMemo(() => {
    return selectedClassId
      ? rawData.filter((t) => t.class.id === selectedClassId)
      : rawData;
  }, [rawData, selectedClassId]);

  const uniqueTerms = useMemo(() => {
    const map = new Map<string, { name: string; status: string }>();
    filteredDataByClass.forEach((t) => {
      if (!map.has(t.name)) {
        map.set(t.name, { name: t.name, status: t.status });
      }
    });
    return Array.from(map.values());
  }, [filteredDataByClass]);

  const activeTermData = useMemo(() => {
    return filteredDataByClass.filter((t) => t.name === selectedTermName);
  }, [filteredDataByClass, selectedTermName]);

  const isTermCompleted = activeTermData.every((t) => t.status === "COMPLETED");

  const activeSchedules = useMemo(() => {
    return activeTermData
      .flatMap((t) => t.schedules)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
  }, [activeTermData]);

  const activeSubjects = useMemo(() => {
    return Array.from(
      new Set(activeTermData.flatMap((t) => t.syllabus.map((s) => s.subject)))
    );
  }, [activeTermData]);

  const nextExamDate = activeSchedules[0] ? new Date(activeSchedules[0].examDate) : null;
  const daysLeft = nextExamDate
    ? Math.max(0, Math.ceil((nextExamDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    ...examTypeActions,
    ...subjectConfigActions,
    ...subjectActions,
    classes,
    selectedClassId,
    setSelectedClassId,
    selectedTermName,
    setSelectedTermName,
    selectedSubject,
    setSelectedSubject,
    loading,
    showAllSchedules,
    setShowAllSchedules,
    uniqueTerms,
    isTermCompleted,
    activeSchedules,
    activeSubjects,
    activeTermData,
    nextExamDate,
    daysLeft,
  };
}
