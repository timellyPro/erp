import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { purgeExpiredNewsFeeds } from "@/lib/newsfeedRetention";

declare const globalThis: {
  schoolDashboardPurgeLastRunAt?: number;
} & typeof global;

function maybePurgeExpiredNewsFeeds() {
  const now = Date.now();
  const lastRun = globalThis.schoolDashboardPurgeLastRunAt ?? 0;
  const intervalMs = 10 * 60 * 1000;
  if (now - lastRun < intervalMs) return;
  globalThis.schoolDashboardPurgeLastRunAt = now;
  // Run in background so dashboard response is not blocked by maintenance.
  purgeExpiredNewsFeeds().catch((error) => {
    console.warn("Newsfeed purge skipped due to error:", error);
  });
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export async function GET() {
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
    let schoolId = session.user.schoolId;

    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true, isActive: true },
      });
      if (!adminSchool) {
        return NextResponse.json(
          { message: "School not found in session" },
          { status: 400 }
        );
      }
      if (adminSchool.isActive === false) {
        return NextResponse.json(
          { message: "Your school's Timelly access is deactivated. Please contact Timelly support." },
          { status: 403 }
        );
      }
      schoolId = adminSchool.id;
    } else {
      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true, isActive: true },
      });
      if (!school) {
        return NextResponse.json(
          { message: "School not found" },
          { status: 400 }
        );
      }
      if (school.isActive === false) {
        return NextResponse.json(
          { message: "Your school's Timelly access is deactivated. Please contact Timelly support." },
          { status: 403 }
        );
      }
    }

    maybePurgeExpiredNewsFeeds();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Parallel fetches for dashboard data
    const [
      classCount,
      studentCount,
      teacherCount,
      eventsUpcoming,
      feeSummary,
      todayAttendance,
      leaves,
      newsFeeds,
      recentPayments,
    ] = await Promise.all([
      prisma.class.count({ where: { schoolId } }),
      prisma.student.count({ where: { schoolId } }),
      prisma.user.count({
        where: {
          schoolId,
          role: "TEACHER",
        },
      }),
      prisma.event.findMany({
        where: {
          schoolId,
          eventDate: { gte: todayStart },
        },
        select: {
          id: true,
          title: true,
          eventDate: true,
          _count: { select: { registrations: true } },
        },
        orderBy: { eventDate: "asc" },
        take: 5,
      }),
      prisma.studentFee.aggregate({
        where: { student: { schoolId } },
        _sum: { amountPaid: true, finalFee: true, remainingFee: true },
        _count: true,
      }),
      prisma.attendance.groupBy({
        by: ["status"],
        where: {
          class: { schoolId },
          date: { gte: todayStart, lt: todayEnd },
        },
        _count: true,
      }),
      prisma.leaveRequest.findMany({
        where: { schoolId },
        include: {
          teacher: { select: { id: true, name: true, subject: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.newsFeed.findMany({
        where: { schoolId },
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.payment.findMany({
        where: {
          student: { schoolId },
          status: "SUCCESS",
        },
        select: {
          amount: true,
          createdAt: true,
          student: {
            select: { user: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Class count change (this month)
    const [classCountLastMonth, studentCountLastMonth, teacherCountLastMonth] = await Promise.all([
      prisma.class.count({
        where: {
          schoolId,
          createdAt: { lt: startOfMonth },
        },
      }),
      prisma.student.count({
        where: {
          schoolId,
          createdAt: { lt: startOfMonth },
        },
      }),
      prisma.user.count({
        where: {
          schoolId,
          role: "TEACHER",
          createdAt: { lt: startOfMonth },
        },
      }),
    ]);

    const totalPaid = feeSummary._sum.amountPaid ?? 0;
    const totalFee = feeSummary._sum.finalFee ?? 0;
    const collectedPct = totalFee > 0 ? Math.round((totalPaid / totalFee) * 100) : 0;

    const attendanceByStatus = todayAttendance.reduce(
      (acc, g) => {
        acc[g.status] = g._count;
        return acc;
      },
      {} as Record<string, number>
    );
    const present = attendanceByStatus["PRESENT"] ?? 0;
    const absent = attendanceByStatus["ABSENT"] ?? 0;
    const late = attendanceByStatus["LATE"] ?? 0;
    const totalToday = present + absent + late;
    const overallPct = totalToday > 0 ? ((present + late) / totalToday) * 100 : 0;

    const formatCurrency = (n: number) => {
      if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
      if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
      if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
      return `₹${Math.round(n)}`;
    };

    const workshops = eventsUpcoming.map((e) => {
      const eventDate = toDate(e.eventDate);
      return {
      id: e.id,
      title: e.title,
      date: eventDate ? eventDate.toISOString().slice(0, 10) : null,
      participants: e._count.registrations,
      status: eventDate && eventDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? "Confirmed" : "Scheduled",
    };
    });

    const teachersOnLeave = leaves
      .filter((l) => l.status === "APPROVED" || l.status === "PENDING")
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        name: l.teacher.name,
        subject: l.teacher.subject ?? "-",
        leaveType: l.leaveType,
        status: l.status,
        fromDate: l.fromDate,
        toDate: l.toDate,
        days: Math.ceil(
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
        subtitle: `${p.student.user?.name ?? "Student"} paid ₹${p.amount.toLocaleString("en-IN")} tuition fee`,
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
    const activities = recentActivities.slice(0, 5);

    const latestNews = newsFeeds.map((n) => ({
      id: n.id,
      title: n.title,
      description: n.description,
      postedBy: n.createdBy?.name ?? "Admin",
      createdAt: n.createdAt,
    }));

    return NextResponse.json({
      stats: {
        totalClasses: classCount,
        totalClassesChange: classCount - classCountLastMonth,
        totalStudents: studentCount,
        totalStudentsChange: studentCount - studentCountLastMonth,
        totalTeachers: teacherCount,
        totalTeachersChange: teacherCount - teacherCountLastMonth,
        upcomingWorkshops: eventsUpcoming.length,
        workshopsThisWeek: eventsUpcoming.filter(
          (e) => {
            const eventDate = toDate(e.eventDate);
            return eventDate !== null && eventDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          }
        ).length,
        feesCollected: formatCurrency(totalPaid),
        feesCollectedRaw: totalPaid,
        feesCollectedPct: collectedPct,
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
      workshops,
      teachersOnLeave,
      recentActivities: activities,
      latestNews,
    });
  } catch (error: unknown) {
    console.error("School dashboard error:", error);
    
    // Handle database connection errors
    const err = error as { code?: string; message?: string; name?: string };
    if (err?.code === "P1001" || err?.message?.includes("Can't reach database server") || err?.name === "PrismaClientInitializationError") {
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

function formatTimeAgo(date: Date): string {
  const d = new Date(date);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return d.toLocaleDateString();
}
