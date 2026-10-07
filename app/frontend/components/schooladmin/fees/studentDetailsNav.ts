import { warmStudentDetailsBundle } from "@/lib/loadStudentDetailsBundle";

function buildStudentDetailsUrl(basePath: string, studentId: string, focus?: "fees") {
  const p = new URLSearchParams({
    tab: "student-details",
    studentId,
  });
  if (focus) p.set("focus", focus);
  return `${basePath}?${p.toString()}`;
}

function buildStudentDetailsFeesUrl(basePath: string, studentId: string) {
  return buildStudentDetailsUrl(basePath, studentId, "fees");
}

/** School admin: open Student Details for a student and scroll to the fees block. */
export function schoolAdminStudentDetailsFeesUrl(studentId: string) {
  return buildStudentDetailsFeesUrl("/frontend/pages/schooladmin", studentId);
}

export function warmSchoolAdminStudentDetails(studentId: string) {
  warmStudentDetailsBundle(studentId);
}

/** Teacher portal: same student profile + fees focus. */
export function teacherStudentDetailsFeesUrl(studentId: string) {
  return buildStudentDetailsFeesUrl("/frontend/pages/teacher", studentId);
}

/**
 * Pick school-admin vs teacher student-details URL from the current app route
 * (Admission is embedded in both portals).
 */
export function studentDetailsFeesUrlForPathname(pathname: string | null, studentId: string): string {
  const p = pathname ?? "";
  if (p.includes("/pages/teacher")) {
    return teacherStudentDetailsFeesUrl(studentId);
  }
  return schoolAdminStudentDetailsFeesUrl(studentId);
}

/** Open Student Details tab for a student (no fees focus). */
export function schoolAdminStudentDetailsUrl(studentId: string) {
  return buildStudentDetailsUrl("/frontend/pages/schooladmin", studentId);
}

export function teacherStudentDetailsUrl(studentId: string) {
  return buildStudentDetailsUrl("/frontend/pages/teacher", studentId);
}

export function studentDetailsUrlForPathname(pathname: string | null, studentId: string): string {
  const p = pathname ?? "";
  if (p.includes("/pages/teacher")) {
    return teacherStudentDetailsUrl(studentId);
  }
  return schoolAdminStudentDetailsUrl(studentId);
}
