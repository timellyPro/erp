import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notificationService";
import { assertTeacherCanEnterMarks } from "@/lib/teacherMarksScope";

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

    const {
      studentId,
      classId,
      subject,
      marks,
      totalMarks,
      suggestions,
      examType,
      grade: gradeOverride,
    } = await req.json();

    if (
      !studentId ||
      !classId ||
      !subject ||
      marks === undefined ||
      totalMarks === undefined
    ) {
      return NextResponse.json(
        { message: "Missing required fields: studentId, classId, subject, marks, totalMarks" },
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

    // Verify class belongs to teacher's school
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

    // Verify student belongs to the class
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

    const grade = gradeOverride === "AB" ? "AB" : calculateGrade(marks, totalMarks);

    const mark = await prisma.mark.create({
      data: {
        studentId,
        classId,
        subject: subjectName,
        marks,
        totalMarks,
        grade,
        suggestions: suggestions || null,
        teacherId,
        examType: examTypeValue,
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
  } catch (error: any) {
    console.error("Create marks error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
