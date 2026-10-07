import prisma from "@/lib/db";
import { splitFullNameToApplicationParts } from "@/lib/resolveStudentDisplayName";

type SyncDb = Pick<typeof prisma, "user" | "studentApplication">;

/** Persist an edited student display name on User + linked admission application rows. */
export async function syncStudentDisplayNameRecords(
  db: SyncDb,
  student: {
    id: string;
    schoolId: string;
    aadhaarNo: string;
    user: { id: string } | null;
  },
  fullName: string
): Promise<void> {
  const trimmed = fullName.trim();
  if (trimmed.length < 2) return;

  if (student.user) {
    await db.user.update({
      where: { id: student.user.id },
      data: { name: trimmed },
    });
  }

  const parts = splitFullNameToApplicationParts(trimmed);

  let application = await db.studentApplication.findFirst({
    where: { studentId: student.id },
    select: { id: true },
  });

  if (!application) {
    application = await db.studentApplication.findUnique({
      where: {
        schoolId_aadharNo: { schoolId: student.schoolId, aadharNo: student.aadhaarNo },
      },
      select: { id: true },
    });
  }

  if (!application) return;

  await db.studentApplication.update({
    where: { id: application.id },
    data: {
      firstName: parts.firstName,
      middleName: parts.middleName,
      lastName: parts.lastName,
      studentId: student.id,
    },
  });
}
