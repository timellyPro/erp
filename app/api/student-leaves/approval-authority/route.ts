import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const empty = {
      teacherName: null as string | null,
      photoUrl: null as string | null,
      className: null as string | null,
      section: null as string | null,
    };

    // Fetch student with class and assigned teacher.
    // Prefer session.studentId when present; otherwise fallback to student linked by userId.
    const student = session.user.studentId
      ? await prisma.student.findUnique({
          where: { id: session.user.studentId },
          include: {
            class: {
              include: {
                teacher: true,
              },
            },
          },
        })
      : await prisma.student.findUnique({
          where: { userId: session.user.id },
          include: {
            class: {
              include: {
                teacher: true,
              },
            },
          },
        });

    if (!student) {
      return NextResponse.json(empty, { status: 200 });
    }

    if (!student.class) {
      return NextResponse.json(empty, { status: 200 });
    }

    // Return class info even if teacher is not assigned yet
    if (!student.class.teacher) {
      return NextResponse.json(
        {
          ...empty,
          classId: student.class.id,
          className: student.class.name ?? null,
          section: student.class.section ?? null,
        },
        { status: 200 }
      );
    }

    const teacher = student.class.teacher;
    return NextResponse.json({
      teacherId: teacher.id,
      teacherName: teacher.name ?? null,
      teacherEmail: teacher.email ?? null,
      classId: student.class.id,
      className: student.class.name ?? null,
      section: student.class.section ?? null,
      photoUrl: teacher.photoUrl ?? null,
    });
  } catch (error) {
    logger.error("STUDENT_CLASS_TEACHER_ERROR:", error);
    return NextResponse.json(
      { message: "Server error" },
      { status: 500 }
    );
  }
}
