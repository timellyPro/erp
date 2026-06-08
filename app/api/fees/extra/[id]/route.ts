import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import { extraFeeAppliesToStudentResidency } from "@/lib/extraFeeResidencyScope";
import { patchExtraFeeWithInstallmentSupport } from "@/lib/extraFeeInstallmentDb";
import { invalidateSchoolFeeReadCaches } from "@/lib/studentFeeReadCache";
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

async function eligibleStudentIdsForExtra(
  extraFee: {
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string;
  },
  schoolId: string
) {
  const studentWhere = getStudentWhere(
    extraFee.targetType,
    extraFee.targetClassId,
    extraFee.targetSection,
    extraFee.targetStudentId,
    schoolId
  );
  if (!studentWhere) return [];
  const students = await prisma.student.findMany({
    where: studentWhere,
    select: { id: true, residencyType: true },
  });
  return students
    .filter((s) => extraFeeAppliesToStudentResidency(extraFee.residencyScope, s.residencyType))
    .map((s) => s.id);
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
    console.log("\n========== EXTRA FEE PATCH ==========");
    console.log("Fee ID:", id);
    console.log("Current DB row:", {
      name: extraFee.name,
      amount: extraFee.amount,
      splitIntoTwoInstallments: extraFee.splitIntoTwoInstallments,
      targetType: extraFee.targetType,
    });
    console.log("Request body:", body);
    console.log("====================================\n");

    const result = await patchExtraFeeWithInstallmentSupport(prisma, extraFee, {
      name: body.name,
      amount: body.amount,
      splitIntoTwoInstallments: body.splitIntoTwoInstallments,
      combinedInstallmentTotal: body.combinedInstallmentTotal,
    });

    if (result === "no_changes") {
      console.log("[ExtraFee Installments] PATCH result: no changes\n");
      return NextResponse.json({ extraFee });
    }

    if (result.studentFeeDelta !== 0) {
      const eligibleIds = await eligibleStudentIdsForExtra(extraFee, schoolId);
      await applyStudentFeeDelta(eligibleIds, result.studentFeeDelta);
      console.log("[ExtraFee Installments] Student fee totals adjusted:", {
        studentCount: eligibleIds.length,
        delta: result.studentFeeDelta,
      });
    }

    console.log("\n========== EXTRA FEE PATCH RESULT ==========");
    console.log("Action:", result.migrated ? "SPLIT (1 row → 2 rows)" : result.splitApplied ? "UPDATED PAIR" : "SINGLE ROW");
    console.log("Row IDs now:", result.extraFeeIds);
    console.log("migrated:", result.migrated, "| splitApplied:", result.splitApplied);
    if (result.migrated) {
      console.log("✓ Old lump was replaced by two installment rows in the database.");
    } else if (result.splitApplied) {
      console.log("✓ Both installment rows were updated together.");
    }
    console.log("============================================\n");

    await invalidateSchoolFeeReadCaches(schoolId);

    return NextResponse.json({
      extraFee: result.extraFee,
      extraFeeIds: result.extraFeeIds,
      splitApplied: result.splitApplied,
      migrated: result.migrated,
    });
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

    const eligibleIds = await eligibleStudentIdsForExtra(extraFee, schoolId);
    await applyStudentFeeDelta(eligibleIds, -extraFee.amount);
    await prisma.extraFee.delete({ where: { id } });

    await invalidateSchoolFeeReadCaches(schoolId);
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
