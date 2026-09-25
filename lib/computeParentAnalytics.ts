import prisma from "@/lib/db";
import { buildParentCombinedStats } from "@/lib/buildParentStatsFast";
import {
  getParentPortalServerCached,
  setParentPortalServerCached,
} from "@/lib/parentPortalServerCache";

function getGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C+";
  if (score >= 40) return "C";
  return "D";
}

export type ParentAnalyticsPayload = {
  student: {
    name: string;
    rollNo: string;
    schoolName: string;
    class: string;
    photoUrl?: string | null;
  };
  stats: {
    attendance: {
      percent: number;
      present: number;
      total: number;
      absent: number;
      late: number;
      change: string;
    };
    homework: {
      total: number;
      submitted: number;
      completion: number;
    };
    grade: {
      letter: string;
      score: number;
      rank: number | null;
    };
    fee: {
      pending: number;
      total: number;
      dueDate: string | null;
    };
  };
  performance: {
    data: Array<{ m: string; v: number; info: string }>;
    average: number;
  };
  attendanceAnalysis: {
    percent: number;
    present: number;
    absent: number;
    late: number;
    change: string;
  };
  homeworkTasks: Array<{ subject: string; title: string; time: string }>;
  recentUpdates: Array<{ title: string; date: string }>;
  workshops: Array<{ title: string; date: string }>;
};

export async function computeParentAnalytics(
  studentId: string,
  opts?: { fast?: boolean }
): Promise<ParentAnalyticsPayload | null> {
  const fast = opts?.fast ?? false;
  const cacheKey = `parent:${studentId}:analytics:${fast ? "fast" : "full"}`;
  const cached = getParentPortalServerCached<ParentAnalyticsPayload>(cacheKey);
  if (cached) return cached;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { id: true, name: true, email: true, photoUrl: true } },
      class: { select: { id: true, name: true, section: true } },
      school: { select: { name: true } },
      fee: fast ? { select: { remainingFee: true, finalFee: true } } : true,
    },
  });

  if (!student) return null;

  let totalDays = 0;
  let presentDays = 0;
  let absentDays = 0;
  let lateArrivals = 0;
  let attendancePercent = 0;
  let homeworks: Array<{
    submissions: unknown[];
    dueDate: Date | null;
    subject: string;
    title: string;
  }> = [];
  let marks: Array<{ marks: number; totalMarks: number; createdAt: Date }> = [];

  if (fast) {
    const { stats, att30 } = await buildParentCombinedStats({
      studentId,
      schoolId: student.schoolId,
      classId: student.classId,
      feePendingAmount: student.fee ? (student.fee as { remainingFee: number }).remainingFee : 0,
    });
    totalDays = att30.total;
    presentDays = att30.present;
    absentDays = att30.absent;
    lateArrivals = att30.late;
    attendancePercent = att30.percent;

    const homeworkTotal = stats.homeworkTotal;
    const homeworkSubmitted = stats.homeworkSubmitted;
    const homeworkCompletion = homeworkTotal > 0 ? (homeworkSubmitted / homeworkTotal) * 100 : 0;
    const overallScore = stats.averageMarksPct;
    const feePending = student.fee ? (student.fee as { remainingFee: number }).remainingFee : stats.feePendingAmount;
    const feeTotal = student.fee ? (student.fee as { finalFee: number }).finalFee : 0;
    const feeDueDate = student.fee
      ? new Date(new Date().getFullYear(), 0, 31).toISOString().slice(0, 10)
      : null;

    const payload: ParentAnalyticsPayload = {
      student: {
        name: student.user?.name || "Student",
        rollNo: student.rollNo || "",
        schoolName: student.school?.name || "",
        class: student.class
          ? `${student.class.name}${student.class.section ? ` • ${student.class.section}` : ""}`
          : student.classId
            ? "Class not found"
            : "Not assigned",
        photoUrl: student.user?.photoUrl,
      },
      stats: {
        attendance: {
          percent: Math.round(attendancePercent * 10) / 10,
          present: presentDays,
          total: totalDays,
          absent: absentDays,
          late: lateArrivals,
          change: "+2.3%",
        },
        homework: {
          total: homeworkTotal,
          submitted: homeworkSubmitted,
          completion: Math.round(homeworkCompletion),
        },
        grade: {
          letter: getGrade(overallScore),
          score: Math.round(overallScore * 10) / 10,
          rank: null,
        },
        fee: {
          pending: feePending,
          total: feeTotal,
          dueDate: feeDueDate,
        },
      },
      performance: { data: [], average: Math.round(overallScore) },
      attendanceAnalysis: {
        percent: Math.round(attendancePercent * 10) / 10,
        present: presentDays,
        absent: absentDays,
        late: lateArrivals,
        change: "+2.3%",
      },
      homeworkTasks: [],
      recentUpdates: [],
      workshops: [],
    };

    setParentPortalServerCached(cacheKey, payload, 60_000);
    return payload;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [attendances, homeworkRows, markRows] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: "desc" },
      select: { status: true, date: true },
    }),
    student.classId
      ? prisma.homework.findMany({
          where: { classId: student.classId },
          include: {
            submissions: { where: { studentId }, take: 1 },
            teacher: { select: { name: true } },
          },
          orderBy: { dueDate: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.mark.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      select: { marks: true, totalMarks: true, createdAt: true },
      take: 200,
    }),
  ]);

  homeworks = homeworkRows;
  marks = markRows;

  totalDays = attendances.length;
  presentDays = attendances.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  absentDays = attendances.filter((a) => a.status === "ABSENT").length;
  lateArrivals = attendances.filter((a) => a.status === "LATE").length;
  attendancePercent = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

  let monthlyTrends: Array<{ month: string; value: number; present: number; total: number }> = [];
  {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const attendanceTrends = await prisma.attendance.findMany({
      where: { studentId, date: { gte: sixMonthsAgo } },
      orderBy: { date: "asc" },
      select: { status: true, date: true },
    });

    const attendanceByMonth = attendanceTrends.reduce(
      (acc, a) => {
        const key = a.date.toISOString().slice(0, 7);
        if (!acc[key]) acc[key] = { present: 0, total: 0 };
        acc[key].total += 1;
        if (a.status === "PRESENT" || a.status === "LATE") acc[key].present += 1;
        return acc;
      },
      {} as Record<string, { present: number; total: number }>
    );

    monthlyTrends = Object.entries(attendanceByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
        value: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
        present: v.present,
        total: v.total,
      }));
  }

  const homeworkTotal = homeworks.length;
  const homeworkSubmitted = homeworks.filter((h) => h.submissions.length > 0).length;
  const homeworkCompletion = homeworkTotal > 0 ? (homeworkSubmitted / homeworkTotal) * 100 : 0;

  const totalMarks = marks.reduce((sum, m) => sum + m.marks, 0);
  const totalMaxMarks = marks.reduce((sum, m) => sum + m.totalMarks, 0);
  const overallScore = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;

  const marksByMonth = marks.reduce(
    (acc, m) => {
      const key = m.createdAt.toISOString().slice(0, 7);
      if (!acc[key]) acc[key] = { marks: 0, total: 0, count: 0 };
      acc[key].marks += m.marks;
      acc[key].total += m.totalMarks;
      acc[key].count += 1;
      return acc;
    },
    {} as Record<string, { marks: number; total: number; count: number }>
  );

  const performanceData = Object.entries(marksByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, v]) => ({
      m: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
      v: v.total > 0 ? Math.round((v.marks / v.total) * 100) : 0,
      info: `${v.count} exam(s)`,
    }));

  const finalPerformanceData =
    performanceData.length > 0
      ? performanceData
      : monthlyTrends.map((t) => ({
          m: t.month,
          v: t.value,
          info: `${t.present}/${t.total} days`,
        }));

  const feePending = student.fee ? student.fee.remainingFee : 0;
  const feeTotal = student.fee ? student.fee.finalFee : 0;
  const feeDueDate = student.fee
    ? new Date(new Date().getFullYear(), 0, 31).toISOString().slice(0, 10)
    : null;

  const upcomingHomeworks = homeworks
    .filter((h) => !h.submissions.length && h.dueDate)
    .slice(0, 3)
    .map((h) => {
      const dueDate = h.dueDate ? new Date(h.dueDate) : null;
      const now = new Date();
      const diffTime = dueDate ? dueDate.getTime() - now.getTime() : 0;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let timeLabel = "";
      if (diffDays < 0) timeLabel = "Overdue";
      else if (diffDays === 0) timeLabel = "Today";
      else if (diffDays === 1) timeLabel = "Tomorrow";
      else timeLabel = `${diffDays} days`;

      return { subject: h.subject, title: h.title, time: timeLabel };
    });

  let recentUpdates: Array<{ title: string; date: string }> = [];
  let workshops: Array<{ title: string; date: string }> = [];

  {
    const [events, upcomingEvents] = await Promise.all([
      prisma.event.findMany({
        where: {
          OR: student.classId
            ? [{ classId: student.classId }, { classId: null }]
            : [{ classId: null }],
          schoolId: student.schoolId,
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { title: true, eventDate: true },
      }),
      prisma.event.findMany({
        where: {
          OR: student.classId
            ? [{ classId: student.classId }, { classId: null }]
            : [{ classId: null }],
          schoolId: student.schoolId,
          eventDate: { gte: new Date() },
        },
        orderBy: { eventDate: "asc" },
        take: 2,
        select: { title: true, eventDate: true },
      }),
    ]);

    recentUpdates = events.map((e) => ({
      title: e.title,
      date: e.eventDate
        ? new Date(e.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "TBD",
    }));

    workshops = upcomingEvents.map((e) => ({
      title: e.title,
      date: e.eventDate
        ? new Date(e.eventDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : "TBD",
    }));
  }

  const payload: ParentAnalyticsPayload = {
    student: {
      name: student.user?.name || "Student",
      rollNo: student.rollNo || "",
      schoolName: student.school?.name || "",
      class: student.class
        ? `${student.class.name}${student.class.section ? ` • ${student.class.section}` : ""}`
        : student.classId
          ? "Class not found"
          : "Not assigned",
      photoUrl: student.user?.photoUrl,
    },
    stats: {
      attendance: {
        percent: Math.round(attendancePercent * 10) / 10,
        present: presentDays,
        total: totalDays,
        absent: absentDays,
        late: lateArrivals,
        change: "+2.3%",
      },
      homework: {
        total: homeworkTotal,
        submitted: homeworkSubmitted,
        completion: Math.round(homeworkCompletion),
      },
      grade: {
        letter: getGrade(overallScore),
        score: Math.round(overallScore * 10) / 10,
        rank: null,
      },
      fee: {
        pending: feePending,
        total: feeTotal,
        dueDate: feeDueDate,
      },
    },
    performance: {
      data: finalPerformanceData,
      average:
        finalPerformanceData.length > 0
          ? Math.round(
              finalPerformanceData.reduce((sum, d) => sum + d.v, 0) / finalPerformanceData.length
            )
          : 0,
    },
    attendanceAnalysis: {
      percent: Math.round(attendancePercent * 10) / 10,
      present: presentDays,
      absent: absentDays,
      late: lateArrivals,
      change: "+2.3%",
    },
    homeworkTasks: upcomingHomeworks,
    recentUpdates,
    workshops,
  };

  setParentPortalServerCached(cacheKey, payload, 120_000);
  return payload;
}
