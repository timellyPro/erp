import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

export type ParentStatsSnapshot = {
  presentDays: number;
  totalAttendanceDays: number;
  attendancePct: number;
  homeworkTotal: number;
  homeworkSubmitted: number;
  averageMarksPct: number;
  gradeLabel: string;
  feePendingAmount: number;
};

function gradeFromAverage(avg: number) {
  if (avg >= 90) return "A+";
  if (avg >= 80) return "A";
  if (avg >= 70) return "B+";
  if (avg >= 60) return "B";
  return "C";
}

export function getAcademicYearRange(seed = new Date()) {
  const year = seed.getFullYear();
  const month = seed.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  return {
    start: new Date(startYear, 3, 1),
    end: new Date(startYear + 1, 2, 31),
  };
}

type CombinedStatsRow = {
  ay_present: bigint;
  ay_total: bigint;
  avg_pct: number | null;
  hw_total: bigint;
  hw_submitted: bigint;
  d30_present: bigint;
  d30_absent: bigint;
  d30_late: bigint;
  d30_total: bigint;
};

/** One SQL round-trip for academic-year stats + 30-day attendance + marks + homework. */
export async function buildParentCombinedStats(opts: {
  studentId: string;
  schoolId: string;
  classId: string | null;
  feePendingAmount?: number;
  attendanceStart?: Date;
  attendanceEnd?: Date;
}): Promise<{
  stats: ParentStatsSnapshot;
  att30: { present: number; absent: number; late: number; total: number; percent: number };
}> {
  const { studentId, schoolId, classId } = opts;
  const { start, end } = opts.attendanceStart && opts.attendanceEnd
    ? { start: opts.attendanceStart, end: opts.attendanceEnd }
    : getAcademicYearRange();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = classId
    ? await prisma.$queryRaw<CombinedStatsRow[]>(Prisma.sql`
        WITH ay AS (
          SELECT
            COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::bigint AS present,
            COUNT(*) FILTER (WHERE status <> 'HOLIDAY')::bigint AS total
          FROM "Attendance"
          WHERE "studentId" = ${studentId}
            AND date >= ${start}
            AND date <= ${end}
        ),
        d30 AS (
          SELECT
            COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::bigint AS present,
            COUNT(*) FILTER (WHERE status = 'ABSENT')::bigint AS absent,
            COUNT(*) FILTER (WHERE status = 'LATE')::bigint AS late,
            COUNT(*)::bigint AS total
          FROM "Attendance"
          WHERE "studentId" = ${studentId}
            AND date >= ${thirtyDaysAgo}
        ),
        marks AS (
          SELECT COALESCE(
            AVG(CASE WHEN "totalMarks" > 0 THEN (marks / "totalMarks") * 100 END),
            0
          )::float AS avg_pct
          FROM "Mark"
          WHERE "studentId" = ${studentId}
        ),
        hw AS (
          SELECT
            COUNT(h.id)::bigint AS total,
            COUNT(hs.id)::bigint AS submitted
          FROM "Homework" h
          LEFT JOIN "HomeworkSubmission" hs
            ON hs."homeworkId" = h.id AND hs."studentId" = ${studentId}
          WHERE h."schoolId" = ${schoolId}
            AND h."classId" = ${classId}
        )
        SELECT
          ay.present AS ay_present,
          ay.total AS ay_total,
          marks.avg_pct,
          hw.total AS hw_total,
          hw.submitted AS hw_submitted,
          d30.present AS d30_present,
          d30.absent AS d30_absent,
          d30.late AS d30_late,
          d30.total AS d30_total
        FROM ay, marks, hw, d30
      `)
    : await prisma.$queryRaw<CombinedStatsRow[]>(Prisma.sql`
        WITH ay AS (
          SELECT
            COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::bigint AS present,
            COUNT(*) FILTER (WHERE status <> 'HOLIDAY')::bigint AS total
          FROM "Attendance"
          WHERE "studentId" = ${studentId}
            AND date >= ${start}
            AND date <= ${end}
        ),
        d30 AS (
          SELECT
            COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::bigint AS present,
            COUNT(*) FILTER (WHERE status = 'ABSENT')::bigint AS absent,
            COUNT(*) FILTER (WHERE status = 'LATE')::bigint AS late,
            COUNT(*)::bigint AS total
          FROM "Attendance"
          WHERE "studentId" = ${studentId}
            AND date >= ${thirtyDaysAgo}
        ),
        marks AS (
          SELECT COALESCE(
            AVG(CASE WHEN "totalMarks" > 0 THEN (marks / "totalMarks") * 100 END),
            0
          )::float AS avg_pct
          FROM "Mark"
          WHERE "studentId" = ${studentId}
        )
        SELECT
          ay.present AS ay_present,
          ay.total AS ay_total,
          marks.avg_pct,
          0::bigint AS hw_total,
          0::bigint AS hw_submitted,
          d30.present AS d30_present,
          d30.absent AS d30_absent,
          d30.late AS d30_late,
          d30.total AS d30_total
        FROM ay, marks, d30
      `);

  const row = rows[0];
  const presentDays = Number(row?.ay_present ?? 0);
  const totalAttendanceDays = Number(row?.ay_total ?? 0);
  const averageMarksPct = Number(row?.avg_pct ?? 0);
  const homeworkTotal = Number(row?.hw_total ?? 0);
  const homeworkSubmitted = Number(row?.hw_submitted ?? 0);
  const d30Present = Number(row?.d30_present ?? 0);
  const d30Absent = Number(row?.d30_absent ?? 0);
  const d30Late = Number(row?.d30_late ?? 0);
  const d30Total = Number(row?.d30_total ?? 0);

  return {
    stats: {
      presentDays,
      totalAttendanceDays,
      attendancePct: totalAttendanceDays ? (presentDays / totalAttendanceDays) * 100 : 0,
      homeworkTotal,
      homeworkSubmitted,
      averageMarksPct,
      gradeLabel: gradeFromAverage(averageMarksPct),
      feePendingAmount: opts.feePendingAmount ?? 0,
    },
    att30: {
      present: d30Present,
      absent: d30Absent,
      late: d30Late,
      total: d30Total,
      percent: d30Total > 0 ? (d30Present / d30Total) * 100 : 0,
    },
  };
}

/** Aggregate stats — uses combined SQL when possible. */
export async function buildParentStatsFast(opts: {
  studentId: string;
  schoolId: string;
  classId: string | null;
  attendanceStart?: Date;
  attendanceEnd?: Date;
}): Promise<ParentStatsSnapshot> {
  const [combined, fee] = await Promise.all([
    buildParentCombinedStats(opts),
    prisma.studentFee.findUnique({
      where: { studentId: opts.studentId },
      select: { remainingFee: true },
    }),
  ]);
  return {
    ...combined.stats,
    feePendingAmount: fee?.remainingFee ?? combined.stats.feePendingAmount,
  };
}

/** Last 30 days attendance breakdown for analytics. */
export async function buildParentAttendance30DayStats(studentId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = await prisma.$queryRaw<
    Array<{ present: bigint; absent: bigint; late: bigint; total: bigint }>
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))::bigint AS present,
      COUNT(*) FILTER (WHERE status = 'ABSENT')::bigint AS absent,
      COUNT(*) FILTER (WHERE status = 'LATE')::bigint AS late,
      COUNT(*)::bigint AS total
    FROM "Attendance"
    WHERE "studentId" = ${studentId}
      AND date >= ${thirtyDaysAgo}
  `);

  const present = Number(rows[0]?.present ?? 0);
  const absent = Number(rows[0]?.absent ?? 0);
  const late = Number(rows[0]?.late ?? 0);
  const total = Number(rows[0]?.total ?? 0);
  return { present, absent, late, total, percent: total > 0 ? (present / total) * 100 : 0 };
}
