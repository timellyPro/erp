import prisma from "@/lib/db";
import { getTeacherAccessibleClassIds } from "@/lib/teacherClassAccess";

/** Normalize subject names for case-insensitive comparison. */
export function normalizeSubjectName(subject: string): string {
  return String(subject || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function subjectInTeacherList(
  subject: string,
  teacherSubjects: string[] | null | undefined
): boolean {
  const needle = normalizeSubjectName(subject);
  if (!needle) return false;
  const list = Array.isArray(teacherSubjects) ? teacherSubjects : [];
  return list.some((s) => normalizeSubjectName(s) === needle);
}

/**
 * For TEACHER role: class must be in teachingClassIds or Class.teacherId,
 * and subject must be in User.subjects.
 * School admins and others with school access skip this (caller still checks school).
 */
export async function assertTeacherCanEnterMarks(opts: {
  role: string;
  userId: string;
  classId: string;
  subject: string;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (opts.role !== "TEACHER") {
    return { ok: true };
  }

  const [accessibleIds, teacher] = await Promise.all([
    getTeacherAccessibleClassIds(opts.userId),
    prisma.user.findUnique({
      where: { id: opts.userId },
      select: { subjects: true, subject: true },
    }),
  ]);

  if (!accessibleIds.includes(opts.classId)) {
    return {
      ok: false,
      status: 403,
      message: "You can only enter marks for classes assigned to you",
    };
  }

  const subjects = [
    ...(Array.isArray(teacher?.subjects) ? teacher!.subjects : []),
    ...(teacher?.subject ? [teacher.subject] : []),
  ];

  if (subjects.length === 0) {
    return {
      ok: false,
      status: 403,
      message: "No subjects assigned — contact admin",
    };
  }

  if (!subjectInTeacherList(opts.subject, subjects)) {
    return {
      ok: false,
      status: 403,
      message: "You can only enter marks for subjects assigned to you",
    };
  }

  return { ok: true };
}
