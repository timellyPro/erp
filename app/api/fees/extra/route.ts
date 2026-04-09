import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  if (!schoolId) {
    const teacherClass = await prisma.class.findFirst({
      where: { teacherId: session.user.id },
      select: { schoolId: true },
    });
    schoolId = teacherClass?.schoolId ?? null;
  }
  if (!schoolId) {
    const teacherSchool = await prisma.school.findFirst({
      where: { teachers: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = teacherSchool?.id ?? null;
  }
  return schoolId;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await getSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const extraFees = await prisma.extraFee.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ extraFees });
  } catch (error: any) {
    console.error("Extra fees GET error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await getSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json();
    const { name, amount, targetType, targetClassId, targetSection, targetStudentId } = body;

    if (!name || typeof amount !== "number" || amount <= 0 || !targetType) {
      return NextResponse.json(
        { message: "name, amount (positive number), and targetType (SCHOOL|CLASS|SECTION|STUDENT) required" },
        { status: 400 }
      );
    }

    const validTypes = ["SCHOOL", "CLASS", "SECTION", "STUDENT"];
    if (!validTypes.includes(targetType)) {
      return NextResponse.json(
        { message: "targetType must be SCHOOL, CLASS, SECTION, or STUDENT" },
        { status: 400 }
      );
    }

    if (targetType === "CLASS" && !targetClassId) {
      return NextResponse.json({ message: "targetClassId required when targetType is CLASS" }, { status: 400 });
    }
    if (targetType === "SECTION" && (!targetClassId || !targetSection)) {
      return NextResponse.json({ message: "targetClassId and targetSection required when targetType is SECTION" }, { status: 400 });
    }
    if (targetType === "STUDENT" && !targetStudentId) {
      return NextResponse.json({ message: "targetStudentId required when targetType is STUDENT" }, { status: 400 });
    }

    const extraFee = await prisma.$transaction(async (tx) => {
      const created = await tx.extraFee.create({
        data: {
          schoolId,
          name: String(name).trim(),
          amount: Number(amount),
          targetType,
          targetClassId: targetClassId || null,
          targetSection: targetSection || null,
          targetStudentId: targetStudentId || null,
        },
      });

      const studentWhere =
        targetType === "SCHOOL"
          ? { schoolId }
          : targetType === "SECTION" && targetClassId && targetSection
            ? { schoolId, classId: targetClassId, class: { section: targetSection } }
            : targetType === "CLASS" && targetClassId
              ? { schoolId, classId: targetClassId }
              : targetType === "STUDENT" && targetStudentId
                ? { schoolId, id: targetStudentId }
                : null;

      if (studentWhere) {
        const students = await tx.student.findMany({
          where: studentWhere,
          select: { id: true },
        });
        for (const s of students) {
          const fee = await tx.studentFee.findUnique({ where: { studentId: s.id } });
          if (fee) {
            await tx.studentFee.update({
              where: { studentId: s.id },
              data: {
                totalFee: fee.totalFee + amount,
                finalFee: fee.finalFee + amount,
                remainingFee: fee.remainingFee + amount,
              },
            });
          }
        }
      }
      return created;
    });

    return NextResponse.json({ extraFee }, { status: 201 });
  } catch (error: any) {
    console.error("Extra fee POST error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
