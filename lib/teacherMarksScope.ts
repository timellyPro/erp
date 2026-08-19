import prisma from "@/lib/db";

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
 * For TEACHER role: class must be assigned (teacherId) and subject must be in User.subjects.
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

  const [classRow, teacher] = await Promise.all([
    prisma.class.findFirst({
      where: { id: opts.classId, teacherId: opts.userId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: opts.userId },
      select: { subjects: true, subject: true },
    }),
  ]);

  if (!classRow) {
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
