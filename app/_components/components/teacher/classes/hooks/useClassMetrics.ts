"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchClassAttendanceView } from "@/lib/api/attendanceView";
import { fetchClassMarksView } from "@/lib/api/marks";
import type { StudentRow } from "./useTeacherClasses";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export type StudentMetrics = {
  attendancePct: number | null;
  avgMarksPct: number | null;
  grade: string | null;
};

type MetricsState = {
  byStudentId: Record<string, StudentMetrics>;
  loading: boolean;
  error: string | null;
};

const gradeFromPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return null;
  if (value >= 90) return "A+";
  if (value >= 80) return "A";
  if (value >= 70) return "B+";
  if (value >= 60) return "B";
  if (value >= 50) return "C";
  if (value >= 40) return "D";
  return "F";
};

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value * 10) / 10));

export function useClassMetrics(classId: string | null, students: StudentRow[]) {
  const [state, setState] = useState<MetricsState>({
    byStudentId: {},
    loading: false,
    error: null,
  });

  const studentIds = useMemo(
    () => new Set(students.map((s) => s.id)),
    [students]
  );

  useEffect(() => {
    let isMounted = true;

    if (!classId) {
      setState({ byStudentId: {}, loading: false, error: null });
      return;
    }

    (async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const [attendanceResult, marksResult] = await Promise.all([
          fetchClassAttendanceView(classId),
          fetchClassMarksView(classId),
        ]);

        if (!isMounted) return;

        const attendance = attendanceResult.ok && Array.isArray(attendanceResult.data.attendances)
          ? attendanceResult.data.attendances
          : [];
        const marks = marksResult.ok && Array.isArray(marksResult.data.marks)
          ? marksResult.data.marks
          : [];

        const attendanceMap: Record<string, { total: number; present: number }> =
          {};
        attendance.forEach((record) => {
          if (!studentIds.has(record.studentId)) return;
          if (!attendanceMap[record.studentId]) {
            attendanceMap[record.studentId] = { total: 0, present: 0 };
          }
          attendanceMap[record.studentId].total += 1;
          if (record.status === "PRESENT" || record.status === "LATE") {
            attendanceMap[record.studentId].present += 1;
          }
        });

        const marksMap: Record<string, { sum: number; count: number }> = {};
        marks.forEach((record) => {
          if (!studentIds.has(record.studentId)) return;
          if (record.totalMarks <= 0) return;
          const pct = (record.marks / record.totalMarks) * 100;
          if (!marksMap[record.studentId]) {
            marksMap[record.studentId] = { sum: 0, count: 0 };
          }
          marksMap[record.studentId].sum += pct;
          marksMap[record.studentId].count += 1;
        });

        const byStudentId: Record<string, StudentMetrics> = {};

        students.forEach((student) => {
          const attendanceRow = attendanceMap[student.id];
          const marksRow = marksMap[student.id];

          const attendancePct =
            attendanceRow && attendanceRow.total > 0
              ? clampPercent((attendanceRow.present / attendanceRow.total) * 100)
              : null;

          const avgMarksPct =
            marksRow && marksRow.count > 0
              ? clampPercent(marksRow.sum / marksRow.count)
              : null;

          byStudentId[student.id] = {
            attendancePct,
            avgMarksPct,
            grade: gradeFromPercent(avgMarksPct),
          };
        });

        setState({ byStudentId, loading: false, error: null });
      } catch (err: unknown) {
        if (!isMounted) return;
        setState({
          byStudentId: {},
          loading: false,
          error: getErrorMessage(err) ?? "Unable to load class metrics.",
        });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [classId, studentIds, students]);

  return state;
}
