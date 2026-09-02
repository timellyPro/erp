import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { invalidateParentPortalCaches } from "@/lib/invalidateParentPortalCaches";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!session.user.studentId) {
      return NextResponse.json(
        { message: "Student record not found" },
        { status: 400 }
      );
    }

    const { homeworkId, content, fileUrl } = await req.json();

    if (!homeworkId) {
      return NextResponse.json(
        { message: "Homework ID is required" },
        { status: 400 }
      );
    }

    if (!session.user.studentId) {
      return NextResponse.json(
        { message: "Student record not found" },
        { status: 400 }
      );
    }

    const homework = await prisma.homework.findUnique({
      where: { id: homeworkId },
      select: {
        id: true,
        classId: true,
        class: { select: { schoolId: true } },
      },
    });

    if (!homework) {
      return NextResponse.json(
        { message: "Homework not found" },
        { status: 404 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: session.user.studentId },
      select: { classId: true, schoolId: true },
    });

    if (!student || student.classId !== homework.classId) {
      return NextResponse.json(
        { message: "You are not assigned to this homework's class" },
        { status: 403 }
      );
    }

    // Check if already submitted
    const existingSubmission = await prisma.homeworkSubmission.findUnique({
      where: {
        homeworkId_studentId: {
          homeworkId,
          studentId: session.user.studentId,
        },
      },
    });

    const effectiveSchoolId = session.user.schoolId ?? student.schoolId ?? null;
    if (effectiveSchoolId && homework.class?.schoolId && homework.class.schoolId !== effectiveSchoolId) {
      return NextResponse.json(
        { message: "You are not allowed to submit homework for another school" },
        { status: 403 }
      );
    }

    let submission;
    if (existingSubmission) {
      submission = await prisma.homeworkSubmission.update({
        where: { id: existingSubmission.id },
        data: {
          content: content || null,
          fileUrl: fileUrl || null,
          submittedAt: new Date(),
        },
      });
    } else {
      submission = await prisma.homeworkSubmission.create({
        data: {
          homeworkId,
          studentId: session.user.studentId,
          content: content || null,
          fileUrl: fileUrl || null,
        },
      });
    }

    const schoolId = student.schoolId ?? homework.class?.schoolId;
    if (schoolId) {
      invalidateParentPortalCaches({ schoolId, studentId: session.user.studentId });
    }

    return NextResponse.json(
      {
        message: existingSubmission
          ? "Homework submission updated successfully"
          : "Homework submitted successfully",
        submission,
        homeworkId,
      },
      { status: existingSubmission ? 200 : 201 }
    );
  } catch (error: any) {
    console.error("Submit homework error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
