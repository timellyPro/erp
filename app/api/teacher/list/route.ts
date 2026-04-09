import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let schoolId = session.user.schoolId;

    if (!schoolId) {
      // Try school from admin relation
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
      // For students: get school from student record
      if (!schoolId && (session.user as { studentId?: string }).studentId) {
        const student = await prisma.student.findUnique({
          where: { id: (session.user as { studentId: string }).studentId },
          select: { schoolId: true },
        });
        schoolId = student?.schoolId ?? null;
      }
      if (schoolId) {
        prisma.user.update({
          where: { id: session.user.id },
          data: { schoolId },
        }).catch(() => {});
      }
    }

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }
    const teachers = await prisma.user.findMany({
      where: {
        schoolId: schoolId,
        role: "TEACHER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        teacherId: true,
        subject: true,
        photoUrl: true,
      },
      orderBy: {
        name: "asc",
      },
    });
    return NextResponse.json({ teachers }, { status: 200 });
  } catch (error: any) {
    console.error("List teachers error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
