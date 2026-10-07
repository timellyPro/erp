import prisma from "@/lib/db";

/**
 * Classes a teacher can work with for marks/homework/etc:
 * - teachingClassIds (subject teaching assignments from Add User)
 * - Class.teacherId (class / homeroom teacher from Appoint Teacher)
 */
export async function getTeacherAccessibleClassIds(
  teacherId: string,
  schoolId?: string | null
): Promise<string[]> {
  const [user, homeroom] = await Promise.all([
    prisma.user.findUnique({
      where: { id: teacherId },
      select: { teachingClassIds: true, schoolId: true },
    }),
    prisma.class.findMany({
      where: {
        teacherId,
        ...(schoolId ? { schoolId } : {}),
      },
      select: { id: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const id of user?.teachingClassIds ?? []) {
    if (typeof id === "string" && id.trim()) ids.add(id);
  }
  for (const row of homeroom) ids.add(row.id);
  return Array.from(ids);
}

/** Validate class IDs belong to the school; drop unknowns. */
export async function sanitizeTeachingClassIds(
  classIds: unknown,
  schoolId: string
): Promise<string[]> {
  const raw = Array.isArray(classIds)
    ? classIds.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];
  if (raw.length === 0) return [];

  const valid = await prisma.class.findMany({
    where: { schoolId, id: { in: raw } },
    select: { id: true },
  });
  const allowed = new Set(valid.map((c) => c.id));
  return raw.filter((id) => allowed.has(id));
}

export function mergeAssignedClassIds(
  teachingClassIds: string[] | null | undefined,
  homeroomClasses: { id: string }[] | null | undefined
): string[] {
  const ids = new Set<string>();
  for (const id of teachingClassIds ?? []) {
    if (id) ids.add(id);
  }
  for (const c of homeroomClasses ?? []) {
    if (c?.id) ids.add(c.id);
  }
  return Array.from(ids);
}
