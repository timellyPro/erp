import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { ExamTermStatus } from "@prisma/client";

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null; role: string } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId && session.user.role === "TEACHER") {
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
  return schoolId;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { id } = await params;
    const term = await prisma.examTerm.findFirst({
      where: { id, schoolId },
      include: {
        class: { select: { id: true, name: true, section: true } },
        schedules: { orderBy: { examDate: "asc" } },
        syllabus: {
          orderBy: { subject: "asc" },
          include: { units: { orderBy: { order: "asc" } } },
        },
        sections: { orderBy: { order: "asc" } },
      },
    });
    if (!term) return NextResponse.json({ message: "Exam term not found" }, { status: 404 });
    return NextResponse.json({ term }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exams term GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "TEACHER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found" }, { status: 400 });

    const { id } = await params;
    const existing = await prisma.examTerm.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: "Exam term not found" }, { status: 404 });
    const body = await req.json();
    const data: { name?: string; description?: string | null; status?: ExamTermStatus; classId?: string } = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.description === "string") data.description = body.description.trim();
    if (body.description === null) data.description = null;
    if (body.status === "UPCOMING" || body.status === "COMPLETED") data.status = body.status;
    if (typeof body.classId === "string" && body.classId.trim()) {
      const cls = await prisma.class.findFirst({
        where: { id: body.classId.trim(), schoolId },
        select: { id: true },
      });
      if (!cls) return NextResponse.json({ message: "Class not found" }, { status: 404 });
      data.classId = cls.id;
    }

    const term = await prisma.examTerm.update({
      where: { id },
      data,
    });
    return NextResponse.json({ term }, { status: 200 });
  } catch (e: unknown) {
    console.error("Exams term PUT:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

