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

/** School-wide SCHOOL target extras — shared across students (avoids repeating the heaviest scan). */
const schoolExtrasCache = new Map<
  string,
  { expiresAt: number; rows: ExtraFeeScopeRow[]; selectKey: string }
>();
const SCHOOL_EXTRAS_TTL_MS = 5 * 60 * 1000;

function selectKey(select: Prisma.ExtraFeeSelect): string {
  try {
    return JSON.stringify(select);
  } catch {
    return "default";
  }
}

/**
 * Load extra fees for one student in **one** round-trip.
 * Previously used 4 parallel findMany calls; under a small Prisma pool those queued
 * to ~7–10s each and dominated student-details / fee breakdown latency.
 */
export async function loadExtraFeesForStudentScope(
  scope: StudentScope,
  select: Prisma.ExtraFeeSelect
): Promise<ExtraFeeScopeRow[]> {
  const { schoolId, studentId, classId, classSection } = scope;
  const sk = selectKey(select);

  const schoolCached = schoolExtrasCache.get(schoolId);
  const schoolRows =
    schoolCached && schoolCached.selectKey === sk && Date.now() < schoolCached.expiresAt
      ? schoolCached.rows
      : null;

  const or: Prisma.ExtraFeeWhereInput[] = [
    { targetType: "STUDENT", targetStudentId: studentId },
  ];
  if (!schoolRows) {
    or.push({ targetType: "SCHOOL" });
  }
  if (classId) {
    or.push({ targetType: "CLASS", targetClassId: classId });
  }
  if (classId && classSection) {
    or.push({
      targetType: "SECTION",
      targetClassId: classId,
      targetSection: classSection,
    });
  }

  const rows = (await prisma.extraFee.findMany({
    where: { schoolId, OR: or },
    select,
  })) as ExtraFeeScopeRow[];

  if (!schoolRows) {
    const schoolOnly = rows.filter((r) => r.targetType === "SCHOOL");
    schoolExtrasCache.set(schoolId, {
      expiresAt: Date.now() + SCHOOL_EXTRAS_TTL_MS,
      rows: schoolOnly,
      selectKey: sk,
    });
    return rows;
  }

  return [...schoolRows, ...rows];
}

export function invalidateExtraFeesScopeCache(schoolId?: string): void {
  if (schoolId) {
    schoolExtrasCache.delete(schoolId);
    return;
  }
  schoolExtrasCache.clear();
}
