export const STUDENT_STATUS_ACTIVE = "Active";
export const STUDENT_STATUS_INACTIVE = "Inactive";

export const activeStudentWhere = { status: STUDENT_STATUS_ACTIVE } as const;

export function parseStudentStatus(value: unknown): typeof STUDENT_STATUS_ACTIVE | typeof STUDENT_STATUS_INACTIVE | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().toLowerCase() === "inactive"
    ? STUDENT_STATUS_INACTIVE
    : STUDENT_STATUS_ACTIVE;
}

export function isActiveStudent(status: string | null | undefined): boolean {
  return (status ?? STUDENT_STATUS_ACTIVE) === STUDENT_STATUS_ACTIVE;
}

export function studentStatusFilter(
  statusParam: string | null | undefined
): typeof STUDENT_STATUS_ACTIVE | typeof STUDENT_STATUS_INACTIVE | undefined {
  if (!statusParam?.trim()) return undefined;
  const normalized = statusParam.trim().toLowerCase();
  if (normalized === "inactive") return STUDENT_STATUS_INACTIVE;
  if (normalized === "active") return STUDENT_STATUS_ACTIVE;
  return undefined;
}
