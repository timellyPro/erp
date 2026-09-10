import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { randomUUID } from "crypto";

const DEFAULT_EXAM_TYPES = ["TERM 1", "TERM 2", "FINAL"];

export type ExamTypeSectionPayload = {
  id: string;
  name: string;
  maxMarks: number;
  order: number;
};

export type ExamTypePayload = {
  name: string;
  maxMarks: number | null;
  sections: ExamTypeSectionPayload[];
};

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

function parseMaxMarks(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("maxMarks must be a positive number");
  }
  return n;
}

export async function ensureExamTypeRow(
  schoolId: string,
  name: string,
  maxMarks?: number | null
) {
  const existing = await prisma.examType.findFirst({
    where: { schoolId, name },
    select: { id: true, maxMarks: true },
  });
  if (existing) return existing;
  return prisma.examType.create({
    data: {
      id: randomUUID(),
      name,
      schoolId,
      maxMarks: maxMarks ?? null,
    },
    select: { id: true, maxMarks: true },
  });
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

    const customTypes = await prisma.examType.findMany({
      where: { schoolId },
      select: {
        name: true,
        maxMarks: true,
        sections: {
          orderBy: { order: "asc" },
          select: { id: true, name: true, maxMarks: true, order: true },
        },
      },
    });

    const fromMarks = await prisma.mark.findMany({
      where: {
        class: { schoolId },
        examType: { not: null },
      },
      select: { examType: true },
      distinct: ["examType"],
      take: 200,
    });

    const byName = new Map<string, ExamTypePayload>();
    DEFAULT_EXAM_TYPES.forEach((n) =>
      byName.set(n, { name: n, maxMarks: null, sections: [] })
    );
    customTypes.forEach((t) => {
      const name = t.name.trim().toUpperCase();
      if (!name) return;
      byName.set(name, {
        name,
        maxMarks: t.maxMarks ?? null,
        sections: t.sections,
      });
    });
    fromMarks.forEach((t) => {
      if (!t.examType) return;
      const name = t.examType.trim().toUpperCase();
      if (!name) return;
      if (!byName.has(name)) {
        byName.set(name, { name, maxMarks: null, sections: [] });
      }
    });

    const examTypes: ExamTypePayload[] = Array.from(byName.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ examTypes }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exam types GET:", e);
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
        { message: "Exam type name is required" },
        { status: 400 }
      );
    }

    let maxMarks: number | null = null;
    try {
      const parsed = parseMaxMarks(body.maxMarks);
      if (parsed !== undefined) maxMarks = parsed;
    } catch (err) {
      return NextResponse.json(
        { message: err instanceof Error ? err.message : "Invalid maxMarks" },
        { status: 400 }
      );
    }

    const existing = await prisma.examType.findFirst({
      where: { schoolId, name },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { message: "This exam type name already exists" },
        { status: 409 }
      );
    }

    const id = randomUUID();
    const examType = await prisma.examType.create({
      data: { id, name, schoolId, maxMarks },
      select: {
        id: true,
        name: true,
        schoolId: true,
        maxMarks: true,
        sections: {
          orderBy: { order: "asc" },
          select: { id: true, name: true, maxMarks: true, order: true },
        },
      },
    });

    return NextResponse.json({ examType }, { status: 201 });
  } catch (e: unknown) {
    console.error("Exam types POST:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

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
    const name =
      typeof body.name === "string" ? body.name.trim().toUpperCase() : "";

    if (!name) {
      return NextResponse.json(
        { message: "Exam type name is required" },
        { status: 400 }
      );
    }

    let maxMarks: number | null;
    try {
      const parsed = parseMaxMarks(body.maxMarks);
      if (parsed === undefined) {
        return NextResponse.json(
          { message: "maxMarks is required" },
          { status: 400 }
        );
      }
      maxMarks = parsed;
    } catch (err) {
      return NextResponse.json(
        { message: err instanceof Error ? err.message : "Invalid maxMarks" },
        { status: 400 }
      );
    }

    const existing = await prisma.examType.findFirst({
      where: { schoolId, name },
      select: { id: true },
    });

    let examType;
    if (existing) {
      examType = await prisma.examType.update({
        where: { id: existing.id },
        data: { maxMarks },
        select: {
          id: true,
          name: true,
          schoolId: true,
          maxMarks: true,
          sections: {
            orderBy: { order: "asc" },
            select: { id: true, name: true, maxMarks: true, order: true },
          },
        },
      });
    } else {
      examType = await prisma.examType.create({
        data: { id: randomUUID(), name, schoolId, maxMarks },
        select: {
          id: true,
          name: true,
          schoolId: true,
          maxMarks: true,
          sections: {
            orderBy: { order: "asc" },
            select: { id: true, name: true, maxMarks: true, order: true },
          },
        },
      });
    }

    return NextResponse.json({ examType }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exam types PATCH:", e);
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
        { message: "Exam type name is required" },
        { status: 400 }
      );
    }

    const customTypes = await prisma.examType.findMany({
      where: { schoolId },
      select: { name: true },
    });

    const currentNames = new Set<string>();
    customTypes.forEach((t) => {
      if (t.name) currentNames.add(t.name.trim().toUpperCase());
    });

    if (!currentNames.has(name)) {
      return NextResponse.json(
        { message: "Exam type not found" },
        { status: 404 }
      );
    }

    if (DEFAULT_EXAM_TYPES.includes(name)) {
      return NextResponse.json(
        { message: "Default exam types cannot be deleted" },
        { status: 400 }
      );
    }

    const deleted = await prisma.examType.deleteMany({
      where: { schoolId, name },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { message: "This exam type could not be deleted" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exam types DELETE:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
