import { tenantDb as prisma } from "@/lib/db/tenantContext";
import type { Prisma } from "@prisma/client";
import {
  canonicalStudentPasswordFromDob,
  resolveStudentPasswordState,
  type StudentPasswordState,
} from "@/lib/students/studentDefaultPassword";

export type StudentCredentialRow = {
  studentId: string;
  name: string;
  email: string;
  password: string;
  dob: string;
  className: string;
  section: string;
  admissionNumber: string;
  rollNo: string;
  accountActive: boolean;
  passwordVerified: boolean;
  /** Why the password can or cannot be shown; see StudentPasswordState. */
  passwordState: StudentPasswordState;
};

export type StudentCredentialsPayload = {
  students: StudentCredentialRow[];
  total: number;
  verifiedCount: number;
  mismatchCount: number;
  /** True when more students matched than the page returns (the list was cut at the cap). */
  truncated?: boolean;
};

const MAX_EXPORT = 5000;

export function buildStudentCredentialsWhere(
  schoolId: string,
  classId: string,
  className: string,
  section: string
): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = { schoolId, status: "Active" };

  if (classId) {
    where.classId = classId;
  } else if (className) {
    where.class = {
      schoolId,
      name: className,
      ...(section ? { section } : {}),
    };
  } else if (section) {
    where.class = { schoolId, section };
  }

  return where;
}

import { formatDobYmd } from "@/lib/dobCalendar";

function formatDobDisplay(dob: Date): string {
  return formatDobYmd(dob);
}

async function toCredentialRows(
  students: Array<{
    id: string;
    admissionNumber: string;
    rollNo: string | null;
    dob: Date;
    user: { name: string | null; email: string | null; password: string | null };
    class: { name: string; section: string | null } | null;
  }>
): Promise<StudentCredentialRow[]> {
  return Promise.all(
    students.map(async (s) => {
      const resolved = await resolveStudentPasswordState(s.dob, s.user.password);
      return {
        studentId: s.id,
        name: s.user.name?.trim() || "",
        email: s.user.email?.trim() || "",
        password: resolved.password,
        dob: canonicalStudentPasswordFromDob(s.dob) ? formatDobDisplay(s.dob) : "",
        className: s.class?.name ?? "",
        section: s.class?.section ?? "",
        admissionNumber: s.admissionNumber,
        rollNo: s.rollNo ?? "",
        accountActive: s.user.password !== null,
        passwordVerified: resolved.verified,
        passwordState: resolved.state,
      };
    })
  );
}

export async function computeStudentCredentials(
  schoolId: string,
  filters: { classId?: string; className?: string; section?: string }
): Promise<StudentCredentialsPayload> {
  const classId = filters.classId?.trim() || "";
  const className = filters.className?.trim() || "";
  const section = filters.section?.trim() || "";

  if (classId) {
    const classData = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true },
    });
    if (!classData) {
      throw new Error("Class not found or doesn't belong to your school");
    }
  }

  const where = buildStudentCredentialsWhere(schoolId, classId, className, section);

  const students = await prisma.student.findMany({
    where,
    take: MAX_EXPORT + 1,
    select: {
      id: true,
      admissionNumber: true,
      rollNo: true,
      dob: true,
      user: { select: { name: true, email: true, password: true } },
      class: { select: { name: true, section: true } },
    },
    orderBy: [{ class: { name: "asc" } }, { user: { name: "asc" } }],
  });

  const truncated = students.length > MAX_EXPORT;
  const rows = await toCredentialRows(truncated ? students.slice(0, MAX_EXPORT) : students);
  const verifiedCount = rows.filter((r) => r.passwordVerified).length;
  const mismatchCount = rows.filter((r) => !r.passwordVerified).length;

  return {
    students: rows,
    total: rows.length,
    verifiedCount,
    mismatchCount,
    ...(truncated ? { truncated: true } : {}),
  };
}
