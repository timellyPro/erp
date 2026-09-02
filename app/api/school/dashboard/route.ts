import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { purgeExpiredNewsFeeds } from "@/lib/newsfeedRetention";
import { buildSchoolDashboardCollectionSummary } from "@/lib/buildSchoolDashboardCollection";
import { buildSchoolDashboardFast } from "@/lib/buildSchoolDashboardFast";
import { getSchoolDashboardFeeTotals } from "@/lib/schoolDashboardFeeTotals";
import { resolveSchoolAdminSchoolId } from "@/lib/resolveSchoolAdminSchoolId";
import { todayYmdLocal } from "@/lib/schoolDashboardCollection";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";
import { activeStudentWhere } from "@/lib/studentStatus";

declare const globalThis: {
  schoolDashboardPurgeLastRunAt?: number;
} & typeof global;

function maybePurgeExpiredNewsFeeds() {
  const now = Date.now();
  const lastRun = globalThis.schoolDashboardPurgeLastRunAt ?? 0;
  const intervalMs = 10 * 60 * 1000;
  if (now - lastRun < intervalMs) return;
  globalThis.schoolDashboardPurgeLastRunAt = now;
  purgeExpiredNewsFeeds().catch((error) => {
    console.warn("Newsfeed purge skipped due to error:", error);
  });
}

function formatTimeAgo(date: Date): string {
  const d = new Date(date);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return d.toLocaleDateString();
}

function formatCurrency(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return NextResponse.json(
      { message: "Only admins can view school dashboard" },
      { status: 403 }
    );
  }

  try {
    const ctx = await resolveSchoolAdminSchoolId(session);
    if ("error" in ctx) {
      return NextResponse.json({ message: ctx.error }, { status: ctx.status });
    }
    const schoolId = ctx.schoolId;

    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date")?.trim() || todayYmdLocal();
    const fastOnly = url.searchParams.get("fast") === "1";

    if (fastOnly) {
      const payload = await buildSchoolDashboardFast(schoolId, dateParam);
      return NextResponse.json(payload, { status: 200 });
    }

    const cacheKey = `dashboard:${schoolId}:${dateParam}`;
    const cachedPayload = getSchoolDashboardServerCached<Record<string, unknown>>(cacheKey);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload, { status: 200 });
    }

    maybePurgeExpiredNewsFeeds();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [
      classCount,
      studentCount,
      teacherCount,
      classCountLastMonth,
      studentCountLastMonth,
      teacherCountLastMonth,
      feeTotals,
      todayAttendance,
      leaves,
      newsFeeds,
      recentPayments,
      collection,
    ] = await Promise.all([
      prisma.class.count({ where: { schoolId } }),
      prisma.student.count({ where: { schoolId, ...activeStudentWhere } }),
      prisma.user.count({ where: { schoolId, role: "TEACHER" } }),
      prisma.class.count({ where: { schoolId, createdAt: { lt: startOfMonth } } }),
      prisma.student.count({
        where: { schoolId, ...activeStudentWhere, createdAt: { lt: startOfMonth } },
      }),
      prisma.user.count({
        where: { schoolId, role: "TEACHER", createdAt: { lt: startOfMonth } },
      }),
      getSchoolDashboardFeeTotals(schoolId),
      prisma.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT a.status, COUNT(*)::bigint AS count
        FROM "Attendance" a
        INNER JOIN "Class" c ON c.id = a."classId"
        WHERE c."schoolId" = ${schoolId}
          AND a.date >= ${todayStart}
          AND a.date < ${todayEnd}
        GROUP BY a.status
      `),
      prisma.leaveRequest.findMany({
        where: { schoolId, status: { in: ["APPROVED", "PENDING"] } },
        select: {
          id: true,
          leaveType: true,
          status: true,
          fromDate: true,
          toDate: true,
          createdAt: true,
          teacher: { select: { name: true, subject: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.newsFeed.findMany({
        where: { schoolId },
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.$queryRaw<
        Array<{ amount: number; createdAt: Date; studentName: string | null }>
      >(Prisma.sql`
        SELECT p.amount, p."createdAt", u.name AS "studentName"
        FROM "Payment" p
        INNER JOIN "Student" s ON s.id = p."studentId"
        INNER JOIN "User" u ON u.id = s."userId"
        WHERE s."schoolId" = ${schoolId}
          AND p.status IN ('SUCCESS', 'COMPLETED')
          AND p."eventRegistrationId" IS NULL
        ORDER BY p."createdAt" DESC
        LIMIT 5
      `),
      buildSchoolDashboardCollectionSummary(schoolId, dateParam),
    ]);

    const totalPaid = feeTotals.totalPaid;
    const totalFee = feeTotals.totalFee;
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

    const teachersOnLeave = leaves.slice(0, 5).map((l) => ({
      id: l.id,
      name: l.teacher.name,
      subject: l.teacher.subject ?? "-",
      leaveType: l.leaveType,
      status: l.status,
      fromDate: l.fromDate,
      toDate: l.toDate,
      days:
        Math.ceil(
          (new Date(l.toDate).getTime() - new Date(l.fromDate).getTime()) / (24 * 60 * 60 * 1000)
        ) + 1,
    }));

    const recentActivities: Array<{
      type: string;
      title: string;
      subtitle: string;
      meta: string;
      createdAt: Date;
    }> = [];

    leaves.slice(0, 3).forEach((l) => {
      recentActivities.push({
        type: "Leave Request",
        title: "Leave Request",
        subtitle: `${l.teacher.name} applied for ${l.leaveType.toLowerCase()} leave`,
        meta: formatTimeAgo(l.createdAt),
        createdAt: l.createdAt,
      });
    });

    recentPayments.slice(0, 3).forEach((p) => {
      recentActivities.push({
        type: "Fee Payment",
        title: "Fee Payment",
        subtitle: `${p.studentName ?? "Student"} paid ₹${p.amount.toLocaleString("en-IN")} tuition fee`,
        meta: formatTimeAgo(p.createdAt),
        createdAt: p.createdAt,
      });
    });

    newsFeeds.slice(0, 2).forEach((n) => {
      recentActivities.push({
        type: "News Published",
        title: "News Published",
        subtitle: n.title,
        meta: formatTimeAgo(n.createdAt),
        createdAt: n.createdAt,
      });
    });

    recentActivities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const payload = {
      stats: {
        totalClasses: classCount,
        totalClassesChange: classCount - classCountLastMonth,
        totalStudents: studentCount,
        totalStudentsChange: studentCount - studentCountLastMonth,
        totalTeachers: teacherCount,
        totalTeachersChange: teacherCount - teacherCountLastMonth,
        upcomingWorkshops: 0,
        workshopsThisWeek: 0,
        feesCollected: formatCurrency(totalPaid),
        feesCollectedRaw: totalPaid,
        feesCollectedPct: collectedPct,
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
      teachersOnLeave,
      recentActivities: recentActivities.slice(0, 5),
      latestNews: newsFeeds.map((n) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        postedBy: n.createdBy?.name ?? "Admin",
        createdAt: n.createdAt,
      })),
    };

    setSchoolDashboardServerCached(cacheKey, payload, 120_000);
    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("School dashboard error:", error);

    const err = error as { code?: string; message?: string; name?: string };
    if (
      err?.code === "P1001" ||
      err?.message?.includes("Can't reach database server") ||
      err?.name === "PrismaClientInitializationError"
    ) {
      return NextResponse.json(
        { message: "Database connection failed. Please check your database configuration." },
        { status: 503 }
      );
    }

    if (err?.message?.includes("statement timeout") || err?.message?.includes("Connection terminated")) {
      return NextResponse.json(
        { message: "Database request timed out. Please try again." },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
