import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";

type StudentScope = {
  schoolId: string;
  studentId: string;
  classId: string | null;
  classSection: string | null;
};

type ExtraFeeScopeRow = {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string;
  splitIntoTwoInstallments?: boolean;
};

/**
 * Load extra fees using four index-friendly queries instead of one OR scan.
 * Much faster on remote Postgres (Supabase) for student fee breakdown / payment.
 */
export async function loadExtraFeesForStudentScope(
  scope: StudentScope,
  select: Prisma.ExtraFeeSelect
): Promise<ExtraFeeScopeRow[]> {
  const { schoolId, studentId, classId, classSection } = scope;

  const queries: Array<Promise<ExtraFeeScopeRow[]>> = [
    prisma.extraFee.findMany({
      where: { schoolId, targetType: "SCHOOL" },
      select,
    }) as Promise<ExtraFeeScopeRow[]>,
    classId
      ? (prisma.extraFee.findMany({
          where: { schoolId, targetType: "CLASS", targetClassId: classId },
          select,
        }) as Promise<ExtraFeeScopeRow[]>)
      : Promise.resolve([]),
    classId && classSection
      ? (prisma.extraFee.findMany({
          where: {
            schoolId,
            targetType: "SECTION",
            targetClassId: classId,
            targetSection: classSection,
          },
          select,
        }) as Promise<ExtraFeeScopeRow[]>)
      : Promise.resolve([]),
    prisma.extraFee.findMany({
      where: { schoolId, targetType: "STUDENT", targetStudentId: studentId },
      select,
    }) as Promise<ExtraFeeScopeRow[]>,
  ];

  const chunks = await Promise.all(queries);
  return chunks.flat();
}
