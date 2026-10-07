import prisma from "@/lib/db";
import {
  getParentPortalServerCached,
  setParentPortalServerCached,
} from "@/lib/parentPortalServerCache";
import { buildParentCombinedStats } from "@/lib/buildParentStatsFast";

export type ParentDashboardPayload = {
  studentName: string;
  attendancePct: number;
  presentDays: number;
  totalAttendanceDays: number;
  homeworkSubmitted: number;
  homeworkTotal: number;
  averageMarksPct: number;
  gradeLabel: string;
  feePendingAmount: number;
  circulars: Array<{
    id: string;
    referenceNumber: string | null;
    subject: string;
    content: string;
    publishStatus: string;
    date: string;
    importanceLevel: string | null;
    attachments: unknown[];
    issuedBy: { id: string; name: string | null } | null;
  }>;
  events: Array<{
    id: string;
    title: string;
    type: string | null;
    eventDate: string | null;
  }>;
  feeds: Array<{
    id: string;
    title: string;
    description: string | null;
    photo: string | null;
    likes: number;
    likedByMe: boolean;
    createdAt: string;
    createdBy: { name: string | null; photoUrl: string | null };
  }>;
};

type StudentCtx = {
  id: string;
  classId: string | null;
  schoolId: string;
  userId: string;
  studentName: string;
};

async function loadStudentCtx(studentId: string): Promise<StudentCtx | null> {
  const cached = getParentPortalServerCached<StudentCtx>(`parent:${studentId}:ctx`);
  if (cached) return cached;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      classId: true,
      schoolId: true,
      user: { select: { id: true, name: true } },
    },
  });
  if (!student) return null;

  const ctx: StudentCtx = {
    id: student.id,
    classId: student.classId,
    schoolId: student.schoolId,
    userId: student.user?.id ?? "",
    studentName: student.user?.name || "Student",
  };
  setParentPortalServerCached(`parent:${studentId}:ctx`, ctx, 300_000);
  return ctx;
}

async function buildParentDashboardExtras(ctx: StudentCtx, userId: string) {
  const [circulars, events, feeds] = await Promise.all([
    prisma.circular.findMany({
      where: { schoolId: ctx.schoolId, publishStatus: "PUBLISHED" },
      include: { issuedBy: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
      take: 12,
    }),
    prisma.event.findMany({
      where: {
        schoolId: ctx.schoolId,
        OR: ctx.classId ? [{ classId: ctx.classId }, { classId: null }] : [{ classId: null }],
      },
      select: { id: true, title: true, type: true, eventDate: true },
      orderBy: { eventDate: "asc" },
      take: 10,
    }),
    prisma.newsFeed.findMany({
      where: { schoolId: ctx.schoolId },
      include: {
        createdBy: { select: { name: true, photoUrl: true } },
        likedBy: { where: { userId }, select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  return {
    circulars: circulars.map((c) => ({
      id: c.id,
      referenceNumber: c.referenceNumber,
      subject: c.subject,
      content: c.content,
      publishStatus: c.publishStatus,
      date: c.date.toISOString(),
      importanceLevel: c.importanceLevel,
      attachments: c.attachments ?? [],
      issuedBy: c.issuedBy ? { id: c.issuedBy.id, name: c.issuedBy.name } : null,
    })),
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      eventDate: e.eventDate?.toISOString() ?? null,
    })),
    feeds: feeds.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      photo: f.photo,
      likes: f.likes,
      likedByMe: f.likedBy.length > 0,
      createdAt: f.createdAt.toISOString(),
      createdBy: { name: f.createdBy?.name ?? null, photoUrl: f.createdBy?.photoUrl ?? null },
    })),
  };
}

/** Fast shell — SQL aggregate stats only (~3 queries, target <1s). */
export async function buildParentDashboardFast(studentId: string): Promise<ParentDashboardPayload | null> {
  const cacheKey = `parent:${studentId}:dashboard:fast`;
  const cached = getParentPortalServerCached<ParentDashboardPayload>(cacheKey);
  if (cached) return cached;

  const ctx = await loadStudentCtx(studentId);
  if (!ctx) return null;

  const { stats } = await buildParentCombinedStats({
    studentId: ctx.id,
    schoolId: ctx.schoolId,
    classId: ctx.classId,
  });

  const payload: ParentDashboardPayload = {
    studentName: ctx.studentName,
    ...stats,
    circulars: [],
    events: [],
    feeds: [],
  };

  setParentPortalServerCached(cacheKey, payload, 300_000);
  return payload;
}

/** Full dashboard — aggregate stats + circulars/events/feeds (parallel, not transaction). */
export async function buildParentDashboardFull(
  studentId: string,
  userId: string
): Promise<ParentDashboardPayload | null> {
  const cacheKey = `parent:${studentId}:dashboard:full`;
  const cached = getParentPortalServerCached<ParentDashboardPayload>(cacheKey);
  if (cached) return cached;

  const fast = await buildParentDashboardFast(studentId);
  if (!fast) return null;

  const ctx = await loadStudentCtx(studentId);
  if (!ctx) return fast;

  const extras = await buildParentDashboardExtras(ctx, userId);
  const payload: ParentDashboardPayload = { ...fast, ...extras };

  setParentPortalServerCached(cacheKey, payload, 300_000);
  return payload;
}

/** Background warm for feeds/events without blocking fast path. */
export async function warmParentDashboardExtras(studentId: string, userId: string): Promise<void> {
  const fullKey = `parent:${studentId}:dashboard:full`;
  if (getParentPortalServerCached(fullKey)) return;
  await buildParentDashboardFull(studentId, userId);
}
