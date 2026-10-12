import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { withTenantScopedClient } from "@/lib/db/tenantClient";
import { logger } from "@/lib/logger";
import { schoolIdViaStudentId, schoolIdViaTeacherClass } from "@/lib/auth/tenant";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WRITABLE_ROLES = new Set(["SCHOOLADMIN", "SUPERADMIN"]);
const TIMETABLE_FEATURES = new Set(["timetable", "timetable-manage", "TIMETABLE"]);

type TimetableEntryInput = {
  dayOfWeek?: number;
  dayLabel?: string;
  slotOrder?: number;
  slotType?: string;
  title?: string;
  subject?: string | null;
  startTime?: string;
  endTime?: string;
  room?: string | null;
  notes?: string | null;
  teacherId?: string | null;
};

async function resolveSchoolId(session: { user: { id: string; role?: string | null; schoolId?: string | null; studentId?: string | null } }) {
  let schoolId = session.user.schoolId ?? null;

  if (!schoolId && session.user.studentId) {
    schoolId = await schoolIdViaStudentId(session.user.studentId);
  }

  if (!schoolId && session.user.role === "TEACHER") {
    schoolId = await schoolIdViaTeacherClass(session.user.id);
  }

  if (!schoolId) {
    const school = await prisma.school.findFirst({
      where: {
        OR: [
          { admins: { some: { id: session.user.id } } },
          { teachers: { some: { id: session.user.id } } },
        ],
      },
      select: { id: true },
    });
    schoolId = school?.id ?? null;
  }

  return schoolId;
}

function teacherCanWrite(session: { user: { role?: string | null; allowedFeatures?: string[] | null } }) {
  if (session.user.role !== "TEACHER") return false;
  return (session.user.allowedFeatures ?? []).some((feature) => TIMETABLE_FEATURES.has(feature));
}

 
type ClassStudentLookupClient = {
  student: { findFirst: (args: any) => Promise<{ classId: string | null } | null> };
  class: { findFirst: (args: any) => Promise<{ id: string } | null> };
};

async function resolveRequestedClassId(
  client: ClassStudentLookupClient,
  session: { user: { id: string; role?: string | null; studentId?: string | null } },
  schoolId: string,
  requestedClassId: string | null
) {
  if (session.user.studentId) {
    const student = await client.student.findFirst({
      where: { id: session.user.studentId, schoolId },
      select: { classId: true },
    });
    return student?.classId ?? null;
  }

  if (requestedClassId) {
    const classRow = await client.class.findFirst({
      where: { id: requestedClassId, schoolId },
      select: { id: true },
    });
    return classRow?.id ?? null;
  }

  const firstClass = await client.class.findFirst({
    where: {
      schoolId,
      ...(session.user.role === "TEACHER" ? { OR: [{ teacherId: session.user.id }, { teacherId: null }] } : {}),
    },
    select: { id: true },
    orderBy: [{ name: "asc" }, { section: "asc" }],
  });

  return firstClass?.id ?? null;
}

function cleanText(value: unknown, max = 120) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function normalizeEntries(entries: TimetableEntryInput[]) {
  const normalized = entries
    .map((entry) => {
      const dayOfWeek = Number(entry.dayOfWeek);
      const startTime = cleanText(entry.startTime, 20);
      const endTime = cleanText(entry.endTime, 20);
      const title = cleanText(entry.title, 120);

      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !startTime || !endTime || !title) {
        return null;
      }

      const slotType = String(entry.slotType ?? "PERIOD").toUpperCase() === "BREAK" ? "BREAK" : "PERIOD";

      return {
        dayOfWeek,
        dayLabel: cleanText(entry.dayLabel, 30) ?? DAY_LABELS[dayOfWeek],
        slotOrder: Number.isInteger(entry.slotOrder) ? Number(entry.slotOrder) : 0,
        slotType,
        title,
        subject: cleanText(entry.subject, 120),
        startTime,
        endTime,
        room: cleanText(entry.room, 80),
        notes: cleanText(entry.notes, 500),
        teacherId: cleanText(entry.teacherId, 120),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.slotOrder - b.slotOrder || a.startTime.localeCompare(b.startTime));

  const perDayOrder = new Map<number, number>();
  return normalized.map((entry) => {
    const nextOrder = perDayOrder.get(entry.dayOfWeek) ?? 0;
    perDayOrder.set(entry.dayOfWeek, nextOrder + 1);
    return { ...entry, slotOrder: nextOrder };
  });
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const searchParams = new URL(req.url).searchParams;
    const loadAll = searchParams.get("all") === "1";
    // Real DB-level tenant isolation (docs/SECURITY_REVIEW.md): reads go
    // through the app_tenant connection, restricted by RLS, not just the
    // `where: { schoolId }` filters below.
    if (loadAll && session.user.role !== "STUDENT") {
      const timetables = await withTenantScopedClient(schoolId, (tx) =>
        tx.timetable.findMany({
          where: { schoolId },
          include: {
            class: { select: { id: true, name: true, section: true } },
            entries: {
              include: { teacher: { select: { id: true, name: true, subject: true } } },
              orderBy: [{ dayOfWeek: "asc" }, { slotOrder: "asc" }, { startTime: "asc" }],
            },
          },
          orderBy: [{ updatedAt: "desc" }],
        })
      );

      return NextResponse.json({ timetables }, { status: 200 });
    }

    const requestedClassId = searchParams.get("classId");
    const { classId, timetable } = await withTenantScopedClient(schoolId, async (tx) => {
      const resolvedClassId = await resolveRequestedClassId(tx, session, schoolId, requestedClassId);
      if (!resolvedClassId) return { classId: null, timetable: null };

      const tt = await tx.timetable.findFirst({
        where: { schoolId, classId: resolvedClassId },
        include: {
          class: { select: { id: true, name: true, section: true } },
          entries: {
            include: { teacher: { select: { id: true, name: true, subject: true } } },
            orderBy: [{ dayOfWeek: "asc" }, { slotOrder: "asc" }, { startTime: "asc" }],
          },
        },
      });
      return { classId: resolvedClassId, timetable: tt };
    });

    return NextResponse.json({ timetable, classId }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Get timetable error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!WRITABLE_ROLES.has(session.user.role ?? "") && !teacherCanWrite(session)) {
      return NextResponse.json({ message: "You do not have permission to save timetable" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;
    const classId = cleanText(body.classId, 120);
    if (!classId) {
      return NextResponse.json({ message: "Class is required" }, { status: 400 });
    }

    const classRow = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, name: true, section: true },
    });
    if (!classRow) {
      return NextResponse.json({ message: "Class not found" }, { status: 404 });
    }

    const entries = normalizeEntries(Array.isArray(body.entries) ? body.entries : []);
    if (entries.length === 0) {
      return NextResponse.json({ message: "Add at least one valid period or break" }, { status: 400 });
    }

    const teacherIds = Array.from(new Set(entries.map((entry) => entry.teacherId).filter(Boolean))) as string[];
    let teacherById = new Map<string, { id: string; name: string | null; subject: string | null }>();
    if (teacherIds.length > 0) {
      const teachers = await prisma.user.findMany({
        where: { id: { in: teacherIds }, schoolId, role: "TEACHER" },
        select: { id: true, name: true, subject: true },
      });
      if (teachers.length !== teacherIds.length) {
        return NextResponse.json({ message: "One or more selected teachers are invalid" }, { status: 400 });
      }
      teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
    }

    const upserted = await prisma.timetable.upsert({
      where: { classId },
      create: {
        schoolId,
        classId,
        title: cleanText(body.title, 120) ?? "Weekly Timetable",
        notes: cleanText(body.notes, 1000),
        createdById: session.user.id,
      },
      update: {
        title: cleanText(body.title, 120) ?? "Weekly Timetable",
        notes: cleanText(body.notes, 1000),
        createdById: session.user.id,
      },
    });

    await prisma.timetableEntry.deleteMany({ where: { timetableId: upserted.id } });
    await prisma.timetableEntry.createMany({
      data: entries.map((entry) => ({ ...entry, timetableId: upserted.id })),
    });

    const timetable = {
      ...upserted,
      class: classRow,
      entries: entries.map((entry, index) => ({
        ...entry,
        id: `${upserted.id}-${entry.dayOfWeek}-${index}`,
        timetableId: upserted.id,
        teacher: entry.teacherId ? teacherById.get(entry.teacherId) ?? null : null,
      })),
    };

    return NextResponse.json({ message: "Timetable saved successfully", timetable }, { status: 200 });
    });
  } catch (error: unknown) {
    logger.error("Save timetable error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
