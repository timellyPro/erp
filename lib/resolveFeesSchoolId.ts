import prisma from "@/lib/db";

/**
 * Resolves school id for fee-related APIs when JWT `schoolId` is missing
 * (common for teachers; same pattern as /api/fees/extra and /api/class/list).
 */
export async function resolveFeesSchoolId(session: {
  user: { id: string; schoolId?: string | null };
}): Promise<string | null> {
  let schoolId = session.user.schoolId ?? null;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  if (!schoolId) {
    const teacherClass = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = teacherClass?.schoolId ?? null;
  }
  if (!schoolId) {
    const teacherSchool = await prisma.school.findFirst({
      where: { teachers: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = teacherSchool?.id ?? null;
  }
  return schoolId;
}
