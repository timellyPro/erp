import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { buildSchoolDashboardCollectionSummary } from "@/lib/buildSchoolDashboardCollection";
import { peekSchoolDashboardFeeTotals } from "@/lib/schoolDashboardFeeTotals";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";

function formatCurrency(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

/** Fast dashboard shell — counts, attendance, day collection only (no fee DB scan). */
export async function buildSchoolDashboardFast(schoolId: string, dateParam: string) {
  const fullKey = `dashboard:${schoolId}:${dateParam}`;
  const fullCached = getSchoolDashboardServerCached<Record<string, unknown>>(fullKey);
  if (fullCached) return fullCached;

  const cacheKey = `dashboard:fast:${schoolId}:${dateParam}`;
  const cached = getSchoolDashboardServerCached<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [countsRows, collection, todayAttendance, feeCached] = await Promise.all([
    prisma.$queryRaw<Array<{ classes: bigint; students: bigint; teachers: bigint }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::bigint FROM "Class" WHERE "schoolId" = ${schoolId}) AS classes,
        (SELECT COUNT(*)::bigint FROM "Student" WHERE "schoolId" = ${schoolId} AND status = 'Active') AS students,
        (SELECT COUNT(*)::bigint FROM "User" WHERE "schoolId" = ${schoolId} AND role = 'TEACHER') AS teachers
    `),
    buildSchoolDashboardCollectionSummary(schoolId, dateParam),
    prisma.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
      SELECT a.status, COUNT(*)::bigint AS count
      FROM "Attendance" a
      INNER JOIN "Class" c ON c.id = a."classId"
      WHERE c."schoolId" = ${schoolId}
        AND a.date >= ${todayStart}
        AND a.date < ${todayEnd}
      GROUP BY a.status
    `),
    Promise.resolve(peekSchoolDashboardFeeTotals(schoolId)),
  ]);

  const classCount = Number(countsRows[0]?.classes ?? 0);
  const studentCount = Number(countsRows[0]?.students ?? 0);
  const teacherCount = Number(countsRows[0]?.teachers ?? 0);
  const totalPaid = feeCached?.totalPaid ?? 0;
  const totalFee = feeCached?.totalFee ?? 0;
  const collectedPct = totalFee > 0 ? Math.round((totalPaid / totalFee) * 100) : 0;

  const attendanceByStatus = todayAttendance.reduce(
    (acc, g) => {
      acc[g.status] = Number(g.count);
      return acc;
    },
    {} as Record<string, number>
  );
  const present = attendanceByStatus["PRESENT"] ?? 0;
  const absent = attendanceByStatus["ABSENT"] ?? 0;
  const late = attendanceByStatus["LATE"] ?? 0;
  const totalToday = present + absent + late;
  const overallPct = totalToday > 0 ? ((present + late) / totalToday) * 100 : 0;

  const payload = {
    stats: {
      totalClasses: classCount,
      totalClassesChange: 0,
      totalStudents: studentCount,
      totalStudentsChange: 0,
      totalTeachers: teacherCount,
      totalTeachersChange: 0,
      upcomingWorkshops: 0,
      workshopsThisWeek: 0,
      feesCollected: feeCached ? formatCurrency(totalPaid) : "…",
      feesCollectedRaw: totalPaid,
      feesCollectedPct: feeCached ? collectedPct : 0,
      todayCollectionTotal: collection.todayCollectionTotal,
      todayCollectionTotalRaw: collection.todayCollectionTotalRaw,
    },
    attendance: {
      present,
      absent,
      late,
      total: totalToday,
      overallRate: Math.round(overallPct * 10) / 10,
      presentPct: totalToday > 0 ? ((present / totalToday) * 100).toFixed(1) : "0",
      absentPct: totalToday > 0 ? ((absent / totalToday) * 100).toFixed(1) : "0",
      latePct: totalToday > 0 ? ((late / totalToday) * 100).toFixed(1) : "0",
    },
    workshops: [],
    todayCollectionByMethod: collection.todayCollectionByMethod,
    collectionDate: collection.collectionDate,
    teachersOnLeave: [],
    recentActivities: [],
    latestNews: [],
  };

  setSchoolDashboardServerCached(cacheKey, payload, 300_000);
  return payload;
}
