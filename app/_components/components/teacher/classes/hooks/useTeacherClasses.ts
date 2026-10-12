"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchClassList } from "@/lib/api/classList";
import { fetchAllStudents } from "@/lib/students/fetchAllStudents";
import {
  loadTeacherClasses,
  peekTeacherClasses,
  setTeacherClassesCache,
  type TeacherClassesPayload,
} from "@/lib/teacher/loadTeacherFastTabs";

export type TeacherClass = {
  id: string;
  name: string;
  section?: string | null;
  teacher?: { name?: string | null; subject?: string | null };
  _count?: { students?: number };
};

export type StudentRow = {
  id: string;
  rollNo?: string | null;
  admissionNumber?: string | null;
  phoneNo?: string | null;
  photoUrl?: string | null;
  user?: {
    name?: string | null;
    email?: string | null;
    photoUrl?: string | null;
    image?: string | null;
  };
  class?: { id: string; name: string; section?: string | null };
};

type ClassesState = {
  classes: TeacherClass[];
  students: StudentRow[];
  loading: boolean;
  error: string | null;
};

export function useTeacherClasses() {
  const initial = peekTeacherClasses();
  const [state, setState] = useState<ClassesState>({
    classes: initial?.classes ?? [],
    students: initial?.students ?? [],
    loading: !initial,
    error: null,
  });

  const apply = useCallback((payload: TeacherClassesPayload) => {
    setState({
      classes: payload.classes,
      students: payload.students,
      loading: false,
      error: null,
    });
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean; revalidate?: boolean }) => {
      const revalidate = opts?.revalidate ?? Boolean(opts?.silent);
      if (!revalidate) {
        const cached = peekTeacherClasses();
        if (cached) {
          apply(cached);
          void load({ silent: true, revalidate: true });
          return;
        }
      }

      if (!opts?.silent) {
        setState((prev) => ({
          ...prev,
          loading: prev.classes.length === 0,
          error: null,
        }));
      }

      try {
        const payload = await loadTeacherClasses({ revalidate: true });
        apply(payload);
      } catch (err: unknown) {
        setState((prev) => ({
          classes: opts?.silent ? prev.classes : [],
          students: opts?.silent ? prev.students : [],
          loading: false,
          error: err instanceof Error ? err.message : "Unable to load classes.",
        }));
      }
    },
    [apply]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    try {
      const [classResult, studentRows] = await Promise.all([
        fetchClassList(),
        fetchAllStudents<StudentRow>(undefined, { take: 100, maxPages: 50 }),
      ]);
      if (!classResult.ok) throw new Error("Failed to load classes.");
      const payload: TeacherClassesPayload = {
        classes: Array.isArray(classResult.data.classes) ? (classResult.data.classes as TeacherClass[]) : [],
        students: studentRows,
      };
      setTeacherClassesCache(payload);
      apply(payload);
    } catch {
      void load({ silent: true, revalidate: true });
    }
  }, [apply, load]);

  return { ...state, reload };
}
