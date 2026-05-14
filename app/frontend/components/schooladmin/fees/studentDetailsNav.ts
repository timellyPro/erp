function buildStudentDetailsFeesUrl(basePath: string, studentId: string) {
  const p = new URLSearchParams({
    tab: "student-details",
    studentId,
    focus: "fees",
  });
  return `${basePath}?${p.toString()}`;
}

/** School admin: open Student Details for a student and scroll to the fees block. */
export function schoolAdminStudentDetailsFeesUrl(studentId: string) {
  return buildStudentDetailsFeesUrl("/frontend/pages/schooladmin", studentId);
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
