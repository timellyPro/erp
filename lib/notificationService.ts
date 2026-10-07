import prisma from "@/lib/db";
import type { NotificationType, Role } from "@prisma/client";

const STAFF_ROLES: Role[] = ["TEACHER", "SCHOOLADMIN"];

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string
) {
  try {
    await prisma.notification.create({
      data: { userId, type, title, message },
    });
  } catch (e) {
    console.error("Create notification error:", e);
  }
}

export async function createNotificationsForUserIds(
  userIds: string[],
  type: NotificationType,
  title: string,
  message: string
) {
  if (userIds.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, type, title, message })),
    });
  } catch (e) {
    console.error("Create notifications error:", e);
  }
}

export async function getSchoolUserIds(schoolId: string): Promise<string[]> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      admins: { select: { id: true } },
      teachers: { select: { id: true } },
      students: { select: { userId: true } },
    },
  });
  if (!school) return [];
  const ids = new Set<string>();
  school.admins.forEach((u) => ids.add(u.id));
  school.teachers.forEach((u) => ids.add(u.id));
  school.students.forEach((s) => ids.add(s.userId));

  // Many teachers only have User.schoolId and are not on School.teachers — include them so
  // newsfeed / workshop notifications reach all teachers (same as admins with schoolId).
  const staffBySchoolId = await prisma.user.findMany({
    where: {
      schoolId,
      role: { in: STAFF_ROLES },
    },
    select: { id: true },
  });
  staffBySchoolId.forEach((u) => ids.add(u.id));

  return Array.from(ids);
}

/** Class teacher + school admins (for student leave / certificate request alerts). */
export async function getClassStaffNotifyUserIds(
  schoolId: string,
  classTeacherId: string | null | undefined
): Promise<string[]> {
  const ids = new Set<string>();
  if (classTeacherId) ids.add(classTeacherId);
  const admins = await prisma.user.findMany({
    where: {
      role: "SCHOOLADMIN" satisfies Role,
      OR: [{ schoolId }, { adminSchools: { some: { id: schoolId } } }],
    },
    select: { id: true },
  });
  admins.forEach((a) => ids.add(a.id));
  return Array.from(ids);
}
