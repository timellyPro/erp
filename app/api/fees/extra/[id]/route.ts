import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import { extraFeeAppliesToStudentResidency } from "@/lib/extraFeeResidencyScope";
import { Prisma } from "@prisma/client";

const STUDENT_FEE_UPDATE_CHUNK = 200;

function getStudentWhere(
  targetType: string,
  targetClassId: string | null,
  targetSection: string | null,
  targetStudentId: string | null,
  schoolId: string
) {
  if (targetType === "SCHOOL") return { schoolId };
  if (targetType === "CLASS" && targetClassId)
    return { schoolId, classId: targetClassId };
  if (targetType === "SECTION" && targetClassId && targetSection)
    return {
      schoolId,
      classId: targetClassId,
      class: { section: targetSection },
    };
  if (targetType === "STUDENT" && targetStudentId)
    return { schoolId, id: targetStudentId };
  return null;
}

async function applyStudentFeeDelta(studentIds: string[], delta: number) {
  if (studentIds.length === 0 || delta === 0) return;
  for (let i = 0; i < studentIds.length; i += STUDENT_FEE_UPDATE_CHUNK) {
    const ids = studentIds.slice(i, i + STUDENT_FEE_UPDATE_CHUNK);
    // Keep remainingFee non-negative while applying +/- delta in bulk.
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "StudentFee"
        SET
          "totalFee" = "totalFee" + ${delta},
          "finalFee" = "finalFee" + ${delta},
          "remainingFee" = GREATEST(0, "remainingFee" + ${delta})
        WHERE "studentId" IN (${Prisma.join(ids)})
      `
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin =
    session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { id } = await params;
    const extraFee = await prisma.extraFee.findFirst({
      where: { id, schoolId },
    });
    if (!extraFee) {
      return NextResponse.json(
        { message: "Extra fee not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { name, amount, splitIntoTwoInstallments } = body;

    const updates: Record<string, string | number | boolean> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (amount !== undefined && typeof amount === "number" && amount > 0)
      updates.amount = amount;
    if (splitIntoTwoInstallments !== undefined) {
      updates.splitIntoTwoInstallments = Boolean(splitIntoTwoInstallments);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ extraFee });
    }

    const studentWhere = getStudentWhere(
      extraFee.targetType,
      extraFee.targetClassId,
      extraFee.targetSection,
      extraFee.targetStudentId,
      schoolId
    );

    const updated = await prisma.extraFee.update({
      where: { id },
      data: updates,
    });

    if (studentWhere && updates.amount !== undefined) {
      const delta = (updates.amount as number) - extraFee.amount;
      const students = await prisma.student.findMany({
        where: studentWhere,
        select: { id: true, residencyType: true },
      });
      const eligibleIds = students
        .filter((s) => extraFeeAppliesToStudentResidency(extraFee.residencyScope, s.residencyType))
        .map((s) => s.id);
      await applyStudentFeeDelta(eligibleIds, delta);
    }

    return NextResponse.json({ extraFee: updated });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Extra fee PATCH error:", error);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin =
    session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { id } = await params;
    const extraFee = await prisma.extraFee.findFirst({
      where: { id, schoolId },
    });
    if (!extraFee) {
      return NextResponse.json(
        { message: "Extra fee not found" },
        { status: 404 }
      );
    }

    const studentWhere = getStudentWhere(
      extraFee.targetType,
      extraFee.targetClassId,
      extraFee.targetSection,
      extraFee.targetStudentId,
      schoolId
    );

    if (studentWhere) {
      const students = await prisma.student.findMany({
        where: studentWhere,
        select: { id: true, residencyType: true },
      });
      const eligibleIds = students
        .filter((s) => extraFeeAppliesToStudentResidency(extraFee.residencyScope, s.residencyType))
        .map((s) => s.id);
      await applyStudentFeeDelta(eligibleIds, -extraFee.amount);
    }
    await prisma.extraFee.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Extra fee DELETE error:", error);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
