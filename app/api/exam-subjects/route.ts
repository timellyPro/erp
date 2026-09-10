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

async function getHiddenSubjects(schoolId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<Array<{ hiddenExamSubjects: string[] | null }>>`
    SELECT "hiddenExamSubjects" FROM "SchoolSettings" WHERE "schoolId" = ${schoolId} LIMIT 1
  `;
  const hidden = new Set<string>();
  (rows[0]?.hiddenExamSubjects ?? []).forEach((n) => {
    const key = String(n || "").trim().toUpperCase();
    if (key) hidden.add(key);
  });
  return hidden;
}

async function ensureSettings(schoolId: string): Promise<{
  id: string;
  hiddenExamSubjects: string[];
}> {
  const existing = await prisma.$queryRaw<
    Array<{ id: string; hiddenExamSubjects: string[] | null }>
  >`
    SELECT "id", "hiddenExamSubjects" FROM "SchoolSettings"
    WHERE "schoolId" = ${schoolId}
    LIMIT 1
  `;
  if (existing[0]) {
    return {
      id: existing[0].id,
      hiddenExamSubjects: existing[0].hiddenExamSubjects ?? [],
    };
  }

  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "SchoolSettings" ("id", "schoolId", "hiddenExamSubjects", "createdAt", "updatedAt")
    VALUES (${id}, ${schoolId}, ARRAY[]::TEXT[], NOW(), NOW())
    ON CONFLICT ("schoolId") DO NOTHING
  `;

  const again = await prisma.$queryRaw<
    Array<{ id: string; hiddenExamSubjects: string[] | null }>
  >`
    SELECT "id", "hiddenExamSubjects" FROM "SchoolSettings"
    WHERE "schoolId" = ${schoolId}
    LIMIT 1
  `;
  return {
    id: again[0]?.id ?? id,
    hiddenExamSubjects: again[0]?.hiddenExamSubjects ?? [],
  };
}

async function setHiddenSubjects(schoolId: string, hidden: string[]) {
  await ensureSettings(schoolId);
  await prisma.$executeRawUnsafe(
    `UPDATE "SchoolSettings"
     SET "hiddenExamSubjects" = $1::TEXT[],
         "updatedAt" = NOW()
     WHERE "schoolId" = $2`,
    hidden,
    schoolId
  );
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

    const [customSubjects, teacherSubjects, hidden] = await Promise.all([
      prisma.examSubject.findMany({
        where: { schoolId },
        select: { name: true },
      }),
      prisma.$queryRaw<Array<{ subjects: string[] }>>`
        SELECT "subjects" FROM "User"
        WHERE "schoolId" = ${schoolId}
          AND "role" = 'TEACHER'
          AND array_length("subjects", 1) > 0
      `,
      getHiddenSubjects(schoolId),
    ]);

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

    // Admin-deleted subjects stay hidden even if defaults/teachers still have them
    const subjects = Array.from(names)
      .filter((n) => !hidden.has(n))
      .sort();

    return NextResponse.json({ subjects }, { status: 200 });
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

    if (session.user.role !== "SCHOOLADMIN") {
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

    const existing = await prisma.examSubject.findFirst({
      where: { schoolId, name },
      select: { id: true },
    });

    const settings = await ensureSettings(schoolId);
    const wasHidden = (settings.hiddenExamSubjects ?? []).some(
      (n) => n.trim().toUpperCase() === name
    );
    const nextHidden = (settings.hiddenExamSubjects ?? []).filter(
      (n) => n.trim().toUpperCase() !== name
    );

    if (existing) {
      if (wasHidden) {
        await setHiddenSubjects(schoolId, nextHidden);
        return NextResponse.json(
          { subject: { id: existing.id, name, schoolId } },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { message: "This subject name already exists" },
        { status: 409 }
      );
    }

    const id = randomUUID();
    await prisma.examSubject.create({
      data: { id, name, schoolId },
    });

    if (wasHidden) {
      await setHiddenSubjects(schoolId, nextHidden);
    }

    return NextResponse.json({ subject: { id, name, schoolId } }, { status: 201 });
  } catch (e: unknown) {
    console.error("Exam subjects POST:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/** Rename a subject in the school catalog (does not wipe marks history). */
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "SCHOOLADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
    const from =
      typeof body.from === "string" ? body.from.trim().toUpperCase() : "";
    const to = typeof body.to === "string" ? body.to.trim().toUpperCase() : "";

    if (!from || !to) {
      return NextResponse.json(
        { message: "from and to subject names are required" },
        { status: 400 }
      );
    }
    if (from === to) {
      return NextResponse.json({ subject: { name: to } }, { status: 200 });
    }

    const conflict = await prisma.examSubject.findFirst({
      where: { schoolId, name: to },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json(
        { message: "A subject with the new name already exists" },
        { status: 409 }
      );
    }

    let row = await prisma.examSubject.findFirst({
      where: { schoolId, name: from },
      select: { id: true },
    });

    if (!row) {
      // Create catalog row for virtual/default/teacher-sourced subject, then rename
      row = await prisma.examSubject.create({
        data: { id: randomUUID(), name: to, schoolId },
        select: { id: true },
      });
    } else {
      await prisma.examSubject.update({
        where: { id: row.id },
        data: { name: to },
      });
    }

    const settings = await ensureSettings(schoolId);
    const nextHidden = (settings.hiddenExamSubjects ?? [])
      .map((n) => n.trim().toUpperCase())
      .filter((n) => n && n !== from && n !== to);

    // Hide old name so it doesn't reappear from defaults/teachers
    nextHidden.push(from);

    await setHiddenSubjects(schoolId, Array.from(new Set(nextHidden)));

    return NextResponse.json({ subject: { name: to } }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exam subjects PATCH:", e);
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

    if (session.user.role !== "SCHOOLADMIN") {
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

    // Remove catalog row if present (case-insensitive)
    await prisma.examSubject.deleteMany({
      where: {
        schoolId,
        name: { equals: name, mode: "insensitive" },
      },
    });

    // Always hide so defaults / teacher-assigned names don't come back
    const settings = await ensureSettings(schoolId);
    const nextHidden = Array.from(
      new Set([
        ...(settings.hiddenExamSubjects ?? []).map((n) => n.trim().toUpperCase()),
        name,
      ].filter(Boolean))
    );
    await setHiddenSubjects(schoolId, nextHidden);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exam subjects DELETE:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
