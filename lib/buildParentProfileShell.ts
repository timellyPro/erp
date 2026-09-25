import prisma from "@/lib/db";
import {
  getParentPortalServerCached,
  setParentPortalServerCached,
} from "@/lib/parentPortalServerCache";
import { ageFromDob, formatDobYmd } from "@/lib/dobCalendar";

type ProfileStudentRow = {
  id: string;
  rollNo: string | null;
  admissionNumber: string | null;
  fatherName: string | null;
  motherName: string | null;
  dob: Date | null;
  address: string | null;
  phoneNo: string | null;
  gender: string | null;
  previousSchool: string | null;
  status: string | null;
  user: {
    name: string | null;
    email: string | null;
    photoUrl: string | null;
    mobile: string | null;
  } | null;
  class: { id: string; name: string; section: string | null } | null;
  school: { name: string } | null;
};

export function profileShellFromStudent(student: ProfileStudentRow) {
  const displayName = student.user?.name || "Student";
  const classDisplay = student.class
    ? `${student.class.name}${student.class.section ? `-${student.class.section}` : ""}`
    : "";

  return {
    student: {
      id: student.id,
      name: displayName,
      admissionNumber: student.admissionNumber,
      email: student.user?.email ?? "",
      photoUrl: student.user?.photoUrl ?? null,
      rollNo: student.rollNo ?? "",
      dob: formatDobYmd(student.dob),
      age: ageFromDob(student.dob),
      address: student.address ?? "",
      phone: student.phoneNo ?? student.user?.mobile ?? "",
      fatherName: student.fatherName,
      motherName: student.motherName ?? undefined,
      gender: student.gender ?? undefined,
      previousSchool: student.previousSchool ?? undefined,
      status: student.status ?? undefined,
      schoolName: student.school?.name ?? "",
      class: student.class
        ? {
            id: student.class.id,
            name: student.class.name,
            section: student.class.section,
            displayName: classDisplay,
          }
        : null,
    },
    attendanceTrends: [] as Array<{ month: string; present: number; total: number; pct: number }>,
    academicPerformance: [] as Array<{ subject: string; score: number }>,
    certificates: [] as Array<{ id: string; title: string; issuedDate: string }>,
  };
}

/** Lightweight parent profile — no payments, marks, or attendance history. */
export async function buildParentProfileShell(studentId: string) {
  const cacheKey = `parent:${studentId}:profile:shell`;
  const cached = getParentPortalServerCached<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      rollNo: true,
      admissionNumber: true,
      fatherName: true,
      motherName: true,
      dob: true,
      address: true,
      phoneNo: true,
      gender: true,
      previousSchool: true,
      status: true,
      user: { select: { name: true, email: true, photoUrl: true, mobile: true } },
      class: { select: { id: true, name: true, section: true } },
      school: { select: { name: true } },
    },
  });

  if (!student) return null;

  const payload = profileShellFromStudent(student);
  setParentPortalServerCached(cacheKey, payload, 300_000);
  return payload;
}
