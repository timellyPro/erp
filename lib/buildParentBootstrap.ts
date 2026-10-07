import prisma from "@/lib/db";
import type { ParentDashboardPayload } from "@/lib/buildParentDashboard";
import { buildParentCombinedStats } from "@/lib/buildParentStatsFast";
import { profileShellFromStudent } from "@/lib/buildParentProfileShell";
import type { ParentAnalyticsPayload } from "@/lib/computeParentAnalytics";
import {
  getParentPortalServerCached,
  setParentPortalServerCached,
} from "@/lib/parentPortalServerCache";
import {
  parentPortalSwrWrite,
  PARENT_DASHBOARD_FAST_TTL,
  PARENT_ANALYTICS_TTL,
} from "@/lib/parentPortalSwr";

export type ParentBootstrapPayload = {
  dashboard: ParentDashboardPayload;
  analytics: ParentAnalyticsPayload;
  profile: ReturnType<typeof profileShellFromStudent>;
  parentDetails: {
    address: string;
    fatherName: string;
    motherName: string;
    occupation: string;
    fatherPhone: string;
  };
};

function gradeFromAverage(avg: number) {
  if (avg >= 90) return "A+";
  if (avg >= 80) return "A";
  if (avg >= 70) return "B+";
  if (avg >= 60) return "B";
  if (avg >= 50) return "C+";
  if (avg >= 40) return "C";
  return "D";
}

function analyticsFromStudent(
  student: {
    rollNo: string | null;
    classId: string | null;
    class: { name: string; section: string | null } | null;
    school: { name: string } | null;
    user: { name: string | null; photoUrl: string | null } | null;
    fee: { remainingFee: number; finalFee: number } | null;
  },
  stats: Awaited<ReturnType<typeof buildParentCombinedStats>>["stats"],
  att30: Awaited<ReturnType<typeof buildParentCombinedStats>>["att30"]
): ParentAnalyticsPayload {
  const homeworkCompletion =
    stats.homeworkTotal > 0 ? (stats.homeworkSubmitted / stats.homeworkTotal) * 100 : 0;

  return {
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
        percent: Math.round(att30.percent * 10) / 10,
        present: att30.present,
        total: att30.total,
        absent: att30.absent,
        late: att30.late,
        change: "+2.3%",
      },
      homework: {
        total: stats.homeworkTotal,
        submitted: stats.homeworkSubmitted,
        completion: Math.round(homeworkCompletion),
      },
      grade: {
        letter: gradeFromAverage(stats.averageMarksPct),
        score: Math.round(stats.averageMarksPct * 10) / 10,
        rank: null,
      },
      fee: {
        pending: student.fee?.remainingFee ?? stats.feePendingAmount,
        total: student.fee?.finalFee ?? 0,
        dueDate: student.fee
          ? new Date(new Date().getFullYear(), 0, 31).toISOString().slice(0, 10)
          : null,
      },
    },
    performance: { data: [], average: Math.round(stats.averageMarksPct) },
    attendanceAnalysis: {
      percent: Math.round(att30.percent * 10) / 10,
      present: att30.present,
      absent: att30.absent,
      late: att30.late,
      change: "+2.3%",
    },
    homeworkTasks: [],
    recentUpdates: [],
    workshops: [],
  };
}

/** One student query + aggregate SQL — target <2s cold start. */
export async function buildParentBootstrap(
  studentId: string,
  _userId: string,
  _schoolId: string
): Promise<ParentBootstrapPayload | null> {
  const memKey = `parent:${studentId}:bootstrap`;
  const cached = getParentPortalServerCached<ParentBootstrapPayload>(memKey);
  if (cached) return cached;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      classId: true,
      schoolId: true,
      rollNo: true,
      address: true,
      fatherName: true,
      motherName: true,
      occupation: true,
      phoneNo: true,
      user: { select: { name: true, photoUrl: true, email: true, mobile: true } },
      class: { select: { id: true, name: true, section: true } },
      school: { select: { name: true } },
      fee: { select: { remainingFee: true, finalFee: true } },
      admissionNumber: true,
      dob: true,
      gender: true,
      previousSchool: true,
      status: true,
    },
  });
  if (!student) return null;

  const { stats, att30 } = await buildParentCombinedStats({
    studentId,
    schoolId: student.schoolId,
    classId: student.classId,
    feePendingAmount: student.fee?.remainingFee ?? 0,
  });

  const dashboard: ParentDashboardPayload = {
    studentName: student.user?.name || "Student",
    ...stats,
    circulars: [],
    events: [],
    feeds: [],
  };

  const profile = profileShellFromStudent(student);

  const analytics = analyticsFromStudent(student, stats, att30);

  const payload: ParentBootstrapPayload = {
    dashboard,
    analytics,
    profile,
    parentDetails: {
      address: student.address ?? "",
      fatherName: student.fatherName ?? "",
      motherName: student.motherName ?? "",
      occupation: student.occupation ?? "",
      fatherPhone: student.phoneNo ?? "",
    },
  };

  setParentPortalServerCached(`parent:${studentId}:dashboard:fast`, dashboard, 300_000);
  setParentPortalServerCached(`parent:${studentId}:analytics:fast`, analytics, 300_000);
  setParentPortalServerCached(`parent:${studentId}:profile:shell`, profile, 300_000);
  setParentPortalServerCached(memKey, payload, 120_000);

  void Promise.all([
    parentPortalSwrWrite({
      schoolId: student.schoolId,
      namespace: "api",
      resource: "parent:bootstrap",
      params: { studentId },
      serverKey: memKey,
      ttl: PARENT_DASHBOARD_FAST_TTL,
      value: payload,
    }),
    parentPortalSwrWrite({
      schoolId: student.schoolId,
      namespace: "api",
      resource: "parent:dashboard",
      params: { studentId, fast: true },
      serverKey: `parent:${studentId}:dashboard:fast`,
      ttl: PARENT_DASHBOARD_FAST_TTL,
      value: dashboard,
    }),
    parentPortalSwrWrite({
      schoolId: student.schoolId,
      namespace: "api",
      resource: "parent:analytics",
      params: { studentId, fast: true },
      serverKey: `parent:${studentId}:analytics:fast`,
      ttl: PARENT_ANALYTICS_TTL,
      value: analytics,
    }),
  ]).catch(() => undefined);

  return payload;
}
