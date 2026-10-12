import { useCallback, useEffect, type MutableRefObject } from "react";
import { readStudentListCacheLegacy, writeStudentListCacheLegacy } from "@/lib/students/studentListSessionCache";
import { resolveStudentDisplayName } from "@/lib/students/resolveStudentDisplayName";
import type { StudentDetail, StudentOption } from "./types";
import { buildPlaceholderById, normalizeStudentOption } from "./studentDetailHelpers";

/** Loads the student list + classes, and follows a `?studentId=` deep link (seeds a placeholder; the details bundle fills in the rest). */
export function useStudentListBootstrap({
  studentIdFromUrl,
  students,
  setStudents,
  setListLoading,
  setClasses,
  setSelectedId,
  setDetail,
  selectedIdRef,
  setFeeBreakdown,
  setFeeBreakdownPending,
  setTransactionsReady,
}: {
  studentIdFromUrl: string | null;
  students: StudentOption[];
  setStudents: (updater: StudentOption[] | ((prev: StudentOption[]) => StudentOption[])) => void;
  setListLoading: (loading: boolean) => void;
  setClasses: (classes: { id: string; name: string; section: string | null }[]) => void;
  setSelectedId: (updater: string | null | ((prev: string | null) => string | null)) => void;
  setDetail: (updater: StudentDetail | null | ((prev: StudentDetail | null) => StudentDetail | null)) => void;
  selectedIdRef: MutableRefObject<string | null>;
  setFeeBreakdown: (breakdown: null) => void;
  setFeeBreakdownPending: (pending: boolean) => void;
  setTransactionsReady: (ready: boolean) => void;
}) {
  const mapListRow = useCallback(
    (s: {
      id: string;
      user?: { name?: string };
      admissionNumber?: string;
      fatherName?: string;
      parentName?: string;
      rollNo?: string | null;
      penNumber?: string | null;
      apaarId?: string | null;
      status?: string;
      application?: {
        firstName?: string | null;
        middleName?: string | null;
        lastName?: string | null;
      } | null;
      class?: { id: string; name: string; section: string | null };
    }): StudentOption => ({
      id: s.id,
      name: resolveStudentDisplayName({
        user: s.user,
        application: s.application,
        fatherName: s.fatherName,
        admissionNumber: s.admissionNumber,
      }),
      admissionNumber: s.admissionNumber ?? "",
      parentName: s.fatherName?.trim() || s.parentName?.trim() || "-",
      classDisplay: s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "-",
      classId: s.class?.id ?? "",
      section: s.class?.section ?? null,
      status: s.status ?? "Active",
      rollNo: s.rollNo ?? null,
      penNumber: s.penNumber ?? null,
      apaarId: s.apaarId ?? null,
    }),
    []
  );

  useEffect(() => {
    const cached = readStudentListCacheLegacy<StudentOption>();
    if (cached?.length) {
      setStudents(cached.map((s) => normalizeStudentOption(s)));
      setListLoading(false);
    }

    let cancelled = false;

    (async () => {
      try {
        // One lean request (search=1 => minimal columns, all=1 => no cursor round-trips), in parallel with classes.
        const classesPromise = fetch("/api/class/list?lite=1", { credentials: "include" }).then(async (r) => {
          if (!cancelled && r.ok) {
            const c = await r.json();
            setClasses(c.classes ?? []);
          }
        });
        const studentsPromise = fetch("/api/student/list?search=1&all=1&take=10000", {
          credentials: "include",
          cache: "no-store",
        }).then(async (r) => {
          if (cancelled || !r.ok) return;
          const data = await r.json().catch(() => ({}));
          const rows = Array.isArray(data?.students) ? data.students : [];
          if (!rows.length) return;
          const options = rows.map(mapListRow).map(normalizeStudentOption);
          setStudents(options);
          writeStudentListCacheLegacy(options);
        });
        await Promise.all([classesPromise, studentsPromise]);

        if (!cancelled) setListLoading(false);
      } catch {
        if (!cancelled && !cached?.length) setStudents([]);
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentIdFromUrl, mapListRow, setClasses, setListLoading, setStudents]);

  // Deep link (?studentId=…): follow the URL when it changes. Do NOT depend on `students` here — that
  // was resetting selection back to the URL id on every list refresh and overwrote the student's dropdown pick.
  useEffect(() => {
    if (!studentIdFromUrl) return;
    if (selectedIdRef.current !== studentIdFromUrl) {
      setFeeBreakdown(null);
      setFeeBreakdownPending(true);
      setTransactionsReady(false);
      setDetail(buildPlaceholderById(studentIdFromUrl));
    }
    setSelectedId(studentIdFromUrl);
  }, [
    studentIdFromUrl,
    selectedIdRef,
    setSelectedId,
    setDetail,
    setFeeBreakdown,
    setFeeBreakdownPending,
    setTransactionsReady,
  ]);

  // Deep-link name/class comes from the details bundle (core/shell). Do not also hit
  // /api/student/list — that competed for the Prisma pool (~7s findUnique in logs).

  useEffect(() => {
    if (studentIdFromUrl) return;
    if (students.length === 0) return;
    setSelectedId((prev) => (prev && students.some((s) => s.id === prev) ? prev : students[0].id));
  }, [students, studentIdFromUrl, setSelectedId]);
}
