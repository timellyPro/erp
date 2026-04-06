import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

type TeacherAttendanceRow = {
  id: string;
  teacherId: string;
  schoolId: string;
  date: Date;
  status: string;
  teacher_id: string;
  teacher_name: string | null;
  teacher_email: string | null;
  teacher_teacherId: string | null;
  teacher_subject: string | null;
};

/** Prisma uses P2010 for raw query failures; PG relation missing is 42P01. */
function isTableMissingError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string; meta?: { code?: string } };
  const code = err.code ?? err.meta?.code;
  const msg = String(err.message ?? "");
  return code === "P2010" || code === "42P01" || msg.includes("does not exist");
}

function isAlreadyExistsError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string };
  const c = err.code;
  const msg = String(err.message ?? "");
  return c === "42P07" || c === "42710" || c === "42P16" || msg.includes("already exists");
}

/** Create TeacherDailyAttendance table and indexes if missing. */
async function ensureTable(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "TeacherDailyAttendance" (
        "id" TEXT NOT NULL,
        "teacherId" TEXT NOT NULL,
        "schoolId" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "status" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TeacherDailyAttendance_pkey" PRIMARY KEY ("id")
      )`
    );
  } catch (e) {
    if (!isAlreadyExistsError(e)) throw e;
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "TeacherDailyAttendance_teacherId_date_key" ON "TeacherDailyAttendance"("teacherId", "date")`
    );
  } catch (e) {
    if (!isAlreadyExistsError(e)) throw e;
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TeacherDailyAttendance_schoolId_date_idx" ON "TeacherDailyAttendance"("schoolId", "date")`
    );
  } catch (e) {
    if (!isAlreadyExistsError(e)) throw e;
  }
  try {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TeacherDailyAttendance_teacherId_idx" ON "TeacherDailyAttendance"("teacherId")`
    );
  } catch (e) {
    if (!isAlreadyExistsError(e)) throw e;
  }
  for (const constraint of [
    `ALTER TABLE "TeacherDailyAttendance" ADD CONSTRAINT "TeacherDailyAttendance_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "TeacherDailyAttendance" ADD CONSTRAINT "TeacherDailyAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  ]) {
    try {
      await prisma.$executeRawUnsafe(constraint);
    } catch (e) {
      if (!isAlreadyExistsError(e)) throw e;
    }
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");
    if (!dateStr) {
      return NextResponse.json({ message: "date query required" }, { status: 400 });
    }
    const dateOnly = new Date(dateStr);
    dateOnly.setUTCHours(0, 0, 0, 0);
    const dateIso = dateOnly.toISOString().slice(0, 10);

    let records: TeacherAttendanceRow[];
    try {
      records = await prisma.$queryRawUnsafe<TeacherAttendanceRow[]>(
        `SELECT t."id", t."teacherId", t."schoolId", t."date", t."status",
                u."id" as "teacher_id", u."name" as "teacher_name", u."email" as "teacher_email",
                u."teacherId" as "teacher_teacherId", u."subject" as "teacher_subject"
         FROM "TeacherDailyAttendance" t
         INNER JOIN "User" u ON u."id" = t."teacherId"
         WHERE t."schoolId" = $1 AND t."date" = $2::date`,
        schoolId,
        dateIso
      );
    } catch (e: any) {
      if (isTableMissingError(e)) {
        await ensureTable();
        records = await prisma.$queryRawUnsafe<TeacherAttendanceRow[]>(
          `SELECT t."id", t."teacherId", t."schoolId", t."date", t."status",
                  u."id" as "teacher_id", u."name" as "teacher_name", u."email" as "teacher_email",
                  u."teacherId" as "teacher_teacherId", u."subject" as "teacher_subject"
           FROM "TeacherDailyAttendance" t
           INNER JOIN "User" u ON u."id" = t."teacherId"
           WHERE t."schoolId" = $1 AND t."date" = $2::date`,
          schoolId,
          dateIso
        );
      } else throw e;
    }

    return NextResponse.json({
      attendances: records.map((r) => ({
        teacherId: r.teacherId,
        teacher: {
          id: r.teacher_id,
          name: r.teacher_name,
          email: r.teacher_email,
          teacherId: r.teacher_teacherId,
          subject: r.teacher_subject,
        },
        status: r.status,
        date: r.date,
      })),
    });
  } catch (error: any) {
    console.error("Get teacher attendance error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
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
    const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
    const hasFeature = session.user.role === "TEACHER" && (session.user.allowedFeatures?.includes("TEACHER_LEAVES") || session.user.allowedFeatures?.includes("TEACHERS"));
    if (!isAdmin && !hasFeature) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
    const { date: dateStr, attendances } = body as {
      date: string;
      attendances: Array<{ teacherId: string; status: string }>;
    };
    if (!dateStr || !Array.isArray(attendances)) {
      return NextResponse.json(
        { message: "date and attendances array required" },
        { status: 400 }
      );
    }
    const dateOnly = new Date(dateStr);
    dateOnly.setUTCHours(0, 0, 0, 0);
    const dateIso = dateOnly.toISOString().slice(0, 10);
    const validStatuses = ["PRESENT", "ABSENT", "LATE", "ON_LEAVE"];

    try {
      await prisma.$executeRawUnsafe(`SELECT 1 FROM "TeacherDailyAttendance" LIMIT 1`);
    } catch (e: any) {
      if (isTableMissingError(e)) {
        await ensureTable();
      } else {
        throw e;
      }
    }

    for (const a of attendances) {
      if (!a.teacherId || !validStatuses.includes(a.status)) continue;

      const teacher = await prisma.user.findFirst({
        where: { id: a.teacherId, schoolId, role: "TEACHER" },
      });
      if (!teacher) continue;

      await prisma.$executeRawUnsafe(
        `INSERT INTO "TeacherDailyAttendance" ("id", "teacherId", "schoolId", "date", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::date, $5, NOW(), NOW())
         ON CONFLICT ("teacherId", "date") DO UPDATE SET "status" = $5, "updatedAt" = NOW()`,
        randomUUID(),
        a.teacherId,
        schoolId,
        dateIso,
        a.status
      );
    }

    return NextResponse.json({ message: "Attendance saved", ok: true });
  } catch (error: any) {
    console.error("Mark teacher attendance error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
