"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAllStudents } from "@/lib/fetchAllStudents";

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
  const [state, setState] = useState<ClassesState>({
    classes: [],
    students: [],
    loading: true,
    error: null,
  });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setState((prev) => ({ ...prev, loading: true, error: null }));
    }

    try {
      const [classRes, studentRows] = await Promise.all([
        fetch("/api/class/list", { credentials: "include", cache: "no-store" }),
        fetchAllStudents<StudentRow>(undefined, { take: 100, maxPages: 50 }),
      ]);

      if (!classRes.ok) throw new Error("Failed to load classes.");

      const classData = await classRes.json();

      setState({
        classes: Array.isArray(classData?.classes) ? classData.classes : [],
        students: studentRows,
        loading: false,
        error: null,
      });
    } catch (err: unknown) {
      setState((prev) => ({
        classes: opts?.silent ? prev.classes : [],
        students: opts?.silent ? prev.students : [],
        loading: false,
        error: err instanceof Error ? err.message : "Unable to load classes.",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: () => load({ silent: true }) };
}
