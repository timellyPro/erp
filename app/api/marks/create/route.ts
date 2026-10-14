import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { createNotification } from "@/lib/notificationService";
import { assertTeacherCanEnterMarks } from "@/lib/teacher/teacherMarksScope";
import { parseMarkComponents, sumComponents } from "@/lib/exams/markComponents";
import { loadConfiguredMarkLimits, markLimitError } from "@/lib/exams/examMarkLimits";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

function calculateGrade(marks: number, totalMarks: number): string {
  const percentage = (marks / totalMarks) * 100;

  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const createMarkBodySchema = z.object({
      studentId: z.string().optional(),
      classId: z.string().optional(),
      subject: z.string().optional(),
      suggestions: z.string().optional().nullable(),
      examType: z.string().optional().nullable(),
      grade: z.string().optional().nullable(),
      components: z.unknown().optional(),
      marks: z.union([z.number(), z.string()]).optional(),
      totalMarks: z.union([z.number(), z.string()]).optional(),
    });
    const parsedBody = createMarkBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;
    const {
      studentId,
      classId,
      subject,
      suggestions,
      examType,
      grade: gradeOverride,
    } = body;

    let components;
    try {
      components = parseMarkComponents(body.components);
    } catch (err) {
      return NextResponse.json(
        { message: toClientErrorMessage(err, "Invalid components") },
        { status: 400 }
      );
    }

    let marks = Number(body.marks);
    let totalMarks = Number(body.totalMarks);

    if (components && components.length > 0) {
      const summed = sumComponents(components);
      marks = summed.marks;
      totalMarks = summed.totalMarks;
    }

    if (
      !studentId ||
      !classId ||
      !subject ||
      !Number.isFinite(marks) ||
      !Number.isFinite(totalMarks)
    ) {
      return NextResponse.json(
        {
          message:
            "Missing required fields: studentId, classId, subject, marks, totalMarks",
        },
        { status: 400 }
      );
    }

    if (marks < 0 || totalMarks <= 0 || marks > totalMarks) {
      return NextResponse.json(
        { message: "Invalid marks: marks must be between 0 and totalMarks" },
        { status: 400 }
      );
    }

    const teacherId = session.user.id;
    const schoolId = session.user.schoolId;

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }
    return await runInTenantScope(schoolId, async (schoolId) => {

    const classData = await prisma.class.findFirst({
      where: {
        id: classId,
        schoolId: schoolId,
      },
    });

    if (!classData) {
      return NextResponse.json(
        { message: "Class not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    const subjectName = typeof subject === "string" ? subject.trim() : "";
    if (!subjectName) {
      return NextResponse.json({ message: "Subject is required" }, { status: 400 });
    }

    const scope = await assertTeacherCanEnterMarks({
      role: session.user.role,
      userId: teacherId,
      classId,
      subject: subjectName,
    });
    if (!scope.ok) {
      return NextResponse.json({ message: scope.message }, { status: scope.status });
    }

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        classId: classId,
        schoolId: schoolId,
      },
    });

    if (!student) {
      return NextResponse.json(
        { message: "Student not found in this class" },
        { status: 404 }
      );
    }

    const examTypeValue =
      typeof examType === "string" && examType.trim()
        ? examType.trim().toUpperCase()
        : null;

    const hasComponents = !!(components && components.length > 0);

    if (examTypeValue) {
      const limits = await loadConfiguredMarkLimits({
        schoolId,
        examType: examTypeValue,
        subject: subjectName,
      });
      const limitMessage = markLimitError({
        limits,
        totalMarks,
        hasComponents,
        examType: examTypeValue,
        subject: subjectName,
      });
      if (limitMessage) {
        return NextResponse.json({ message: limitMessage }, { status: 400 });
      }
    }

    const grade = gradeOverride === "AB" ? "AB" : calculateGrade(marks, totalMarks);
    const markId = randomUUID();

    // Nested create avoids interactive $transaction (remote DB often exceeds 5s default)
    const mark = await prisma.mark.create({
      data: {
        id: markId,
        studentId,
        classId,
        subject: subjectName,
        marks,
        totalMarks,
        grade,
        suggestions: suggestions || null,
        teacherId,
        examType: examTypeValue,
        ...(hasComponents && components
          ? {
              components: {
                create: components.map((c) => ({
                  id: randomUUID(),
                  name: c.name,
                  marks: c.marks,
                  totalMarks: c.totalMarks,
                })),
              },
            }
          : {}),
      },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        class: {
          select: { id: true, name: true, section: true },
        },
        teacher: {
          select: { id: true, name: true, email: true },
        },
        components: { orderBy: { name: "asc" } },
      },
    });

    if (mark.student?.user?.id) {
      createNotification(
        mark.student.user.id,
        "MARKS",
        "Marks updated",
        grade === "AB"
          ? `${subject}: Absent`
          : `${subject}: ${marks}/${totalMarks} - Grade ${grade}`
      ).catch(() => {});
    }

    return NextResponse.json(
      { message: "Marks added successfully", mark },
      { status: 201 }
    );
    });
  } catch (error: unknown) {
    logger.error("Create marks error:", error);
    return NextResponse.json(
      {
        message:
          toClientErrorMessage(error, "Internal server error"),
      },
      { status: 500 }
    );
  }
}
