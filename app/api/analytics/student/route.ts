import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const studentId = session.user.studentId;

    if (!studentId) {
      return NextResponse.json(
        { message: "No student linked to this account" },
        { status: 400 }
      );
    }

    // Fetch student details
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { id: true, name: true, email: true, photoUrl: true } },
        class: { select: { id: true, name: true, section: true } },
        school: { select: { name: true } },
        fee: true,
      },
    });

    if (!student) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    // Fetch attendance (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const attendances = await prisma.attendance.findMany({
      where: {
        studentId,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: "desc" },
    });

    // Calculate attendance stats
    const totalDays = attendances.length;
    const presentDays = attendances.filter(
      (a) => a.status === "PRESENT" || a.status === "LATE"
    ).length;
    const absentDays = attendances.filter((a) => a.status === "ABSENT").length;
    const lateArrivals = attendances.filter((a) => a.status === "LATE").length;
    const attendancePercent = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

    // Fetch attendance for last 6 months for trends
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const attendanceTrends = await prisma.attendance.findMany({
      where: {
        studentId,
        date: { gte: sixMonthsAgo },
      },
      orderBy: { date: "asc" },
    });

    // Group by month
    const attendanceByMonth = attendanceTrends.reduce(
      (acc, a) => {
        const key = a.date.toISOString().slice(0, 7); // YYYY-MM
        if (!acc[key]) acc[key] = { present: 0, total: 0 };
        acc[key].total += 1;
        if (a.status === "PRESENT" || a.status === "LATE") acc[key].present += 1;
        return acc;
      },
      {} as Record<string, { present: number; total: number }>
    );

    const monthlyTrends = Object.entries(attendanceByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short" }),
        value: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
        present: v.present,
        total: v.total,
      }));

    // Fetch homework
    const homeworks = student.classId
      ? await prisma.homework.findMany({
          where: {
            classId: student.classId,
          },
          include: {
            submissions: {
              where: { studentId },
              take: 1,
            },
            teacher: { select: { name: true } },
          },
          orderBy: { dueDate: "desc" },
          take: 10,
        })
      : [];

    const homeworkTotal = homeworks.length;
    const homeworkSubmitted = homeworks.filter((h) => h.submissions.length > 0).length;
    const homeworkCompletion = homeworkTotal > 0 ? (homeworkSubmitted / homeworkTotal) * 100 : 0;

    // Fetch marks for overall grade calculation
    const marks = await prisma.mark.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    });

    // Calculate overall grade
    const totalMarks = marks.reduce((sum, m) => sum + m.marks, 0);
    const totalMaxMarks = marks.reduce((sum, m) => sum + m.totalMarks, 0);
    const overallScore = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;

    // Get grade letter
    const getGrade = (score: number): string => {
      if (score >= 90) return "A+";
      if (score >= 80) return "A";
      if (score >= 70) return "B+";
      if (score >= 60) return "B";
      if (score >= 50) return "C+";
      if (score >= 40) return "C";
      return "D";
    };

    // Calculate rank (simplified - would need class comparison in real scenario)
    // For now, we'll use a placeholder
    const rank = null; // Would require comparing with other students

    // Performance overview - last 6 months from marks
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

    // If no performance data, use attendance trends
    const finalPerformanceData =
      performanceData.length > 0
        ? performanceData
        : monthlyTrends.map((t) => ({
            m: t.month,
            v: t.value,
            info: `${t.present}/${t.total} days`,
          }));

    // Fee information
    const feePending = student.fee ? student.fee.remainingFee : 0;
    const feeTotal = student.fee ? student.fee.finalFee : 0;
    const feeDueDate = student.fee
      ? new Date(new Date().getFullYear(), 0, 31).toISOString().slice(0, 10) // Jan 31
      : null;

    // Recent homework tasks (upcoming)
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

        return {
          subject: h.subject,
          title: h.title,
          time: timeLabel,
        };
      });

    // Recent updates (events)
    const events = await prisma.event.findMany({
      where: {
        OR: student.classId
          ? [{ classId: student.classId }, { classId: null }]
          : [{ classId: null }],
        schoolId: student.schoolId,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    const recentUpdates = events.map((e) => ({
      title: e.title,
      date: e.eventDate ? new Date(e.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD",
    }));

    // Upcoming workshops (events)
    const upcomingEvents = await prisma.event.findMany({
      where: {
        OR: student.classId
          ? [{ classId: student.classId }, { classId: null }]
          : [{ classId: null }],
        schoolId: student.schoolId,
        eventDate: { gte: new Date() },
      },
      orderBy: { eventDate: "asc" },
      take: 2,
    });

    const workshops = upcomingEvents.map((e) => ({
      title: e.title,
      date: e.eventDate ? new Date(e.eventDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "TBD",
    }));

    const response = {
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
          change: "+2.3%", // Placeholder - would need previous period comparison
        },
        homework: {
          total: homeworkTotal,
          submitted: homeworkSubmitted,
          completion: Math.round(homeworkCompletion),
        },
        grade: {
          letter: getGrade(overallScore),
          score: Math.round(overallScore * 10) / 10,
          rank: rank,
        },
        fee: {
          pending: feePending,
          total: feeTotal,
          dueDate: feeDueDate,
        },
      },
      performance: {
        data: finalPerformanceData,
        average: finalPerformanceData.length > 0
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
        change: "+2.3%", // Placeholder
      },
      homeworkTasks: upcomingHomeworks,
      recentUpdates,
      workshops,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
