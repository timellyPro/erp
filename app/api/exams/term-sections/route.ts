import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

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

/**
 * Resolve mark subsections for a class + exam type name
 * (matches ExamTerm.name case-insensitively).
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (
      session.user.role !== "SCHOOLADMIN" &&
      session.user.role !== "TEACHER"
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = await resolveSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId")?.trim() || "";
    const examType = searchParams.get("examType")?.trim().toUpperCase() || "";

    if (!classId || !examType) {
      return NextResponse.json(
        { message: "classId and examType are required" },
        { status: 400 }
      );
    }

    const terms = await prisma.examTerm.findMany({
      where: { schoolId, classId },
      select: {
        id: true,
        name: true,
        sections: { orderBy: { order: "asc" } },
      },
    });

    const term = terms.find(
      (t) => t.name.trim().toUpperCase() === examType
    );

    return NextResponse.json({
      termId: term?.id ?? null,
      sections: term?.sections ?? [],
    });
  } catch (e: unknown) {
    console.error("Term sections resolve GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
