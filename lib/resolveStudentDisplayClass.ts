type ClassLike = {
  id?: string;
  name?: string | null;
  section?: string | null;
} | null | undefined;

export function resolveStudentDisplayClass(
  studentClass: ClassLike,
  applicationClass?: ClassLike
): ClassLike {
  if (studentClass?.name?.trim()) return studentClass;
  if (applicationClass?.name?.trim()) return applicationClass;
  return studentClass ?? null;
}

export function formatStudentClassDisplay(
  studentClass: ClassLike,
  applicationClass?: ClassLike
): string {
  const resolved = resolveStudentDisplayClass(studentClass, applicationClass);
  if (!resolved?.name) return "-";
  return `${resolved.name}${resolved.section ? `-${resolved.section}` : ""}`;
}

export function isInactiveStudentStatus(status: string | null | undefined): boolean {
  return (status ?? "Active").trim().toLowerCase() === "inactive";
}
