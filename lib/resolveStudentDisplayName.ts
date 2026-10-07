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

/** Split a full name into admission application name fields. */
export function splitFullNameToApplicationParts(fullName: string): {
  firstName: string;
  middleName: string | null;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Student", middleName: null, lastName: "Student" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0]!, middleName: null, lastName: parts[0]! };
  }
  return {
    firstName: parts[0]!,
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    lastName: parts[parts.length - 1]!,
  };
}

/** Prefer login user.name — profile edits save here; application is kept in sync on update. */
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
  const fromUser = (student.user?.name ?? "").trim();
  if (fromUser.length >= 2) return fromUser;

  const fromApp = buildStudentFullNameFromApplication(student.application);
  if (fromApp) return fromApp;

  const admission = (student.admissionNumber ?? "").trim();
  if (admission) return admission;

  return "Student";
}
