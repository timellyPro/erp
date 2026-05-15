import prisma from "@/lib/db";

export type SchoolAdminSchoolContext =
  | { schoolId: string }
  | { error: string; status: 400 | 403 };

/** School id for school-admin dashboard APIs (checks Timelly active flag). */
export async function resolveSchoolAdminSchoolId(session: {
  user: { id: string; schoolId?: string | null };
}): Promise<SchoolAdminSchoolContext> {
  let schoolId = session.user.schoolId ?? null;

  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true, isActive: true },
    });
    if (!adminSchool) {
      return { error: "School not found in session", status: 400 };
    }
    if (adminSchool.isActive === false) {
      return {
        error: "Your school's Timelly access is deactivated. Please contact Timelly support.",
        status: 403,
      };
    }
    return { schoolId: adminSchool.id };
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, isActive: true },
  });
  if (!school) {
    return { error: "School not found", status: 400 };
  }
  if (school.isActive === false) {
    return {
      error: "Your school's Timelly access is deactivated. Please contact Timelly support.",
      status: 403,
    };
  }
  return { schoolId: school.id };
}
