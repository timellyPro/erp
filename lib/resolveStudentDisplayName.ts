/** Build display name from admission application name parts. */
export function buildStudentFullNameFromApplication(
  app:
    | {
        firstName?: string | null;
        middleName?: string | null;
        lastName?: string | null;
      }
    | null
    | undefined
): string {
  if (!app) return "";
  return [app.firstName, app.middleName, app.lastName].filter(Boolean).join(" ").trim();
}

/** Prefer application name over login user.name (which may be a parent or placeholder). */
export function resolveStudentDisplayName(student: {
  user?: { name?: string | null } | null;
  application?:
    | {
        firstName?: string | null;
        middleName?: string | null;
        lastName?: string | null;
      }
    | null;
  fatherName?: string | null;
  admissionNumber?: string | null;
}): string {
  const fromApp = buildStudentFullNameFromApplication(student.application);
  if (fromApp) return fromApp;

  const fromUser = (student.user?.name ?? "").trim();
  if (fromUser) return fromUser;

  const admission = (student.admissionNumber ?? "").trim();
  if (admission) return admission;

  return "Student";
}
