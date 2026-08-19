import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { randomUUID } from "crypto";

const DEFAULT_EXAM_SUBJECTS = [
  "MATHEMATICS",
  "SCIENCE",
  "ENGLISH",
  "HINDI",
  "SOCIAL SCIENCE",
  "PHYSICS",
  "CHEMISTRY",
  "BIOLOGY",
  "COMPUTER SCIENCE",
];

async function resolveSchoolId(session: {
  user: { id: string; schoolId?: string | null; role: string };
}) {
  let schoolId = session.user.schoolId;

  if (!schoolId) {
    if (session.user.role === "TEACHER") {
      const teacherClass = await prisma.class.findFirst({
        where: { teacherId: session.user.id },
        select: { schoolId: true },
      });
      schoolId = teacherClass?.schoolId ?? null;

      if (!schoolId) {
        const teacherSchool = await prisma.school.findFirst({
          where: { teachers: { some: { id: session.user.id } } },
          select: { id: true },
        });
        schoolId = teacherSchool?.id ?? null;
      }
    }

    if (!schoolId) {
      const school = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = school?.id ?? null;
    }
  }

  return schoolId;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "SCHOOLADMIN" && role !== "TEACHER" && role !== "STUDENT") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const customSubjects = await prisma.$queryRaw<
      Array<{ name: string | null }>
    >`
      SELECT "name" FROM "ExamSubject" WHERE "schoolId" = ${schoolId}
    `;

    const teacherSubjects = await prisma.$queryRaw<
      Array<{ subjects: string[] }>
    >`
      SELECT "subjects" FROM "User"
      WHERE "schoolId" = ${schoolId}
        AND "role" = 'TEACHER'
        AND array_length("subjects", 1) > 0
    `;

    const names = new Set<string>();
    DEFAULT_EXAM_SUBJECTS.forEach((n) => names.add(n));
    customSubjects.forEach((s) => {
      if (s.name) names.add(s.name.trim().toUpperCase());
    });
    teacherSubjects.forEach((t) => {
      t.subjects.forEach((s) => {
        if (s) names.add(s.trim().toUpperCase());
      });
    });

    return NextResponse.json(
      { subjects: Array.from(names).sort() },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.error("Exam subjects GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
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

    const role = session.user.role;
    if (role !== "SCHOOLADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
    const name =
      typeof body.name === "string" ? body.name.trim().toUpperCase() : "";

    if (!name) {
      return NextResponse.json(
        { message: "Subject name is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT "name" FROM "ExamSubject"
      WHERE "schoolId" = ${schoolId} AND UPPER("name") = ${name}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { message: "This subject name already exists" },
        { status: 409 }
      );
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ExamSubject" ("id", "name", "schoolId", "createdAt") VALUES ($1, $2, $3, NOW())`,
      id,
      name,
      schoolId
    );

    return NextResponse.json({ subject: { id, name, schoolId } }, { status: 201 });
  } catch (e: unknown) {
    console.error("Exam subjects POST:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "SCHOOLADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const nameParam = searchParams.get("name");
    const name =
      typeof nameParam === "string" ? nameParam.trim().toUpperCase() : "";

    if (!name) {
      return NextResponse.json(
        { message: "Subject name is required" },
        { status: 400 }
      );
    }

    const customSubjects = await prisma.$queryRaw<
      Array<{ name: string | null }>
    >`
      SELECT "name" FROM "ExamSubject" WHERE "schoolId" = ${schoolId}
    `;

    const currentNames = new Set<string>();
    customSubjects.forEach((s) => {
      if (s.name) currentNames.add(s.name.trim().toUpperCase());
    });

    if (!currentNames.has(name)) {
      return NextResponse.json(
        { message: "Subject not found" },
        { status: 404 }
      );
    }

    if (DEFAULT_EXAM_SUBJECTS.includes(name)) {
      return NextResponse.json(
        { message: "Default subjects cannot be deleted" },
        { status: 400 }
      );
    }

    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "ExamSubject" WHERE "schoolId" = $1 AND "name" = $2`,
      schoolId,
      name
    );

    if (!deleted) {
      return NextResponse.json(
        { message: "This subject could not be deleted" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exam subjects DELETE:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
