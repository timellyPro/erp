import type { ExamTypeOption } from "@/lib/exams/examTypes";
import type { ClassData, TermData } from "./types";

/**
 * Single source of truth for the pieces of exams-tab data that feed
 * the shared fast-tab cache (terms, classes, exam types, subjects, and the
 * subjects removed from individual exam types).
 *
 * Previously each of useExamsTabState / useExamTypeActions / useSubjectActions
 * owned its own slice via useState, and cache writes needed a `getSnapshot`
 * callback threaded between the three hooks so a write from one hook could
 * see the others' latest values. That's the closure-coupling smell: state
 * that's really one page's worth of data, sliced across sibling hooks and
 * stitched back together through a ref-like indirection.
 *
 * This reducer holds all four fields together so every update goes through
 * one explicit channel (`dispatch`) and the fast-tab cache can be kept in
 * sync from a single place (see useExamsTabState's cache-sync effect)
 * instead of scattering `writeExamsCache(getSnapshot(), ...)` calls across
 * every mutator in the sibling hooks.
 */
export type ExamsCacheState = {
  terms: TermData[];
  classes: ClassData[];
  examTypes: ExamTypeOption[];
  subjects: string[];
  /** Subjects removed from one exam type. They stay in the catalog. */
  removedByExam: Record<string, string[]>;
};

export type ExamsCacheAction =
  | { type: "SET_EXAM_TYPES"; payload: ExamTypeOption[] }
  | { type: "SET_SUBJECTS"; payload: string[] }
  | { type: "SET_REMOVED_BY_EXAM"; payload: Record<string, string[]> }
  | { type: "SET_PAGE"; payload: ExamsCacheState };

export const initialExamsCacheState: ExamsCacheState = {
  terms: [],
  classes: [],
  examTypes: [],
  subjects: [],
  removedByExam: {},
};

export function examsCacheReducer(
  state: ExamsCacheState,
  action: ExamsCacheAction
): ExamsCacheState {
  switch (action.type) {
    case "SET_EXAM_TYPES":
      return { ...state, examTypes: action.payload };
    case "SET_SUBJECTS":
      return { ...state, subjects: action.payload };
    case "SET_REMOVED_BY_EXAM":
      return { ...state, removedByExam: action.payload };
    case "SET_PAGE":
      return action.payload;
    default:
      return state;
  }
}
