import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { assertTeacherCanEnterMarks } from "@/lib/teacherMarksScope";
import { parseMarkComponents, sumComponents } from "@/lib/markComponents";
import { randomUUID } from "crypto";

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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const markId = id;
    const body = await req.json();
    const {
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
        { message: err instanceof Error ? err.message : "Invalid components" },
        { status: 400 }
      );
    }

    const existingMark = await prisma.mark.findUnique({
      where: { id: markId },
      include: {
        teacher: true,
        class: true,
      },
    });

    if (!existingMark) {
      return NextResponse.json(
        { message: "Mark record not found" },
        { status: 404 }
      );
    }

    if (existingMark.teacherId !== session.user.id) {
      return NextResponse.json(
        { message: "You can only update your own marks" },
        { status: 403 }
      );
    }

    let marks = body.marks !== undefined ? Number(body.marks) : undefined;
    let totalMarks =
      body.totalMarks !== undefined ? Number(body.totalMarks) : undefined;

    const hasComponents = components !== null && components.length > 0;
    if (hasComponents && components) {
      const summed = sumComponents(components);
      marks = summed.marks;
      totalMarks = summed.totalMarks;
    }

    if (marks !== undefined && totalMarks !== undefined) {
      if (marks < 0 || totalMarks <= 0 || marks > totalMarks) {
        return NextResponse.json(
          { message: "Invalid marks: marks must be between 0 and totalMarks" },
          { status: 400 }
        );
      }
    }

    const nextSubject =
      subject !== undefined && typeof subject === "string"
        ? subject.trim()
        : existingMark.subject;
    const scope = await assertTeacherCanEnterMarks({
      role: session.user.role,
      userId: session.user.id,
      classId: existingMark.classId,
      subject: nextSubject,
    });
    if (!scope.ok) {
      return NextResponse.json({ message: scope.message }, { status: scope.status });
    }

    const updateData: Record<string, unknown> = {};
    if (subject !== undefined) updateData.subject = nextSubject;
    if (marks !== undefined) updateData.marks = marks;
    if (totalMarks !== undefined) updateData.totalMarks = totalMarks;
    if (suggestions !== undefined) updateData.suggestions = suggestions;
    if (examType !== undefined) {
      updateData.examType =
        typeof examType === "string" && examType.trim()
          ? examType.trim().toUpperCase()
          : null;
    }

    const finalExamType =
      updateData.examType !== undefined
        ? updateData.examType
        : existingMark.examType;
    const finalTotal =
      totalMarks !== undefined ? totalMarks : existingMark.totalMarks;

    if (finalExamType && existingMark.class?.schoolId && !hasComponents) {
      const configured = await prisma.examType.findFirst({
        where: {
          schoolId: existingMark.class.schoolId,
          name: String(finalExamType).trim().toUpperCase(),
        },
        select: {
          maxMarks: true,
          sections: { select: { id: true } },
        },
      });
      if (configured?.sections?.length) {
        return NextResponse.json(
          {
            message: `${finalExamType} requires subsection marks (configured by school admin)`,
          },
          { status: 400 }
        );
      }
      if (
        configured?.maxMarks != null &&
        configured.maxMarks > 0 &&
        Number(finalTotal) !== Number(configured.maxMarks)
      ) {
        return NextResponse.json(
          {
            message: `Max marks for ${finalExamType} must be ${configured.maxMarks} (set by school admin)`,
          },
          { status: 400 }
        );
      }
    }

    if (gradeOverride === "AB") {
      updateData.grade = "AB";
    } else if (marks !== undefined || totalMarks !== undefined) {
      const finalMarks = marks !== undefined ? marks : existingMark.marks;
      updateData.grade = calculateGrade(finalMarks, finalTotal);
    }

    // Nested write — no interactive transaction (avoids 5s remote-DB timeout)
    const updatedMark = await prisma.mark.update({
      where: { id: markId },
      data: {
        ...updateData,
        ...(components !== null
          ? {
              components: {
                deleteMany: {},
                ...(components.length > 0
                  ? {
                      create: components.map((c) => ({
                        id: randomUUID(),
                        name: c.name,
                        marks: c.marks,
                        totalMarks: c.totalMarks,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
      },
      include: {
        student: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        class: { select: { id: true, name: true, section: true } },
        teacher: { select: { id: true, name: true, email: true } },
        components: { orderBy: { name: "asc" } },
      },
    });

    return NextResponse.json(
      { message: "Marks updated successfully", mark: updatedMark },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Update marks error:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const markId = id;

    const existingMark = await prisma.mark.findUnique({
      where: { id: markId },
    });

    if (!existingMark) {
      return NextResponse.json(
        { message: "Mark record not found" },
        { status: 404 }
      );
    }

    if (existingMark.teacherId !== session.user.id) {
      return NextResponse.json(
        { message: "You can only delete your own marks" },
        { status: 403 }
      );
    }

    await prisma.mark.delete({
      where: { id: markId },
    });

    return NextResponse.json(
      { message: "Mark deleted successfully" },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Delete marks error:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
