import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { runWithDeferredCacheInvalidation } from "@/lib/db";
import {
  cleanupDuplicateHostelMessExtraFees,
  repairIncompleteHostelMessInstallmentPairs,
} from "@/lib/cleanupDuplicateHostelMessExtraFees";
import {
  countMessDuplicateExtraFeeIds,
  findMessFeeDuplicateIssues,
} from "@/lib/findMessFeeDuplicateIssues";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import {
  buildTuitionBulkCache,
  upsertStudentFeeFromStructure,
} from "@/lib/studentTuitionFromStructure";
import { isMessCategoryExtraFeeName } from "@/lib/extraFeeResidencyScope";

async function loadSchoolExtras(schoolId: string) {
  return prisma.extraFee.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      amount: true,
      targetType: true,
      targetClassId: true,
      targetSection: true,
      targetStudentId: true,
      residencyScope: true,
      splitIntoTwoInstallments: true,
    },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManage =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManage) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const [extraFees, classes] = await Promise.all([
      loadSchoolExtras(schoolId),
      prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, section: true },
      }),
    ]);

    const issues = findMessFeeDuplicateIssues(extraFees, classes);
    const duplicateRowCount = countMessDuplicateExtraFeeIds(issues);
    const studentMessCount = extraFees.filter(
      (e) => e.targetType === "STUDENT" && isMessCategoryExtraFeeName(e.name)
    ).length;

    return NextResponse.json({
      issues,
      duplicateRowCount,
      studentMessCount,
      classMessCount: extraFees.filter(
        (e) => e.targetType === "CLASS" && isMessCategoryExtraFeeName(e.name)
      ).length,
    });
  } catch (error: unknown) {
    console.error("GET cleanup-duplicates error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManage =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManage) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const beforeExtras = await loadSchoolExtras(schoolId);
    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, section: true },
    });
    const beforeIssues = findMessFeeDuplicateIssues(beforeExtras, classes);
    const beforeCount = countMessDuplicateExtraFeeIds(beforeIssues);

    let hostelMessCleaned = false;
    let installmentPairsRepaired = 0;
    let studentsRecalculated = 0;

    await runWithDeferredCacheInvalidation(async () => {
      installmentPairsRepaired = await repairIncompleteHostelMessInstallmentPairs(prisma, schoolId);
      hostelMessCleaned = await cleanupDuplicateHostelMessExtraFees(prisma, schoolId);

      const students = await prisma.student.findMany({
        where: { schoolId },
        select: {
          id: true,
          classId: true,
          residencyType: true,
          class: { select: { section: true } },
          fee: { select: { discountPercent: true, amountPaid: true } },
        },
      });
      const cache = await buildTuitionBulkCache(
        prisma,
        schoolId,
        students.map((s) => s.classId)
      );
      for (const s of students) {
        if (!s.fee) continue;
        await upsertStudentFeeFromStructure(
          prisma,
          {
            schoolId,
            studentId: s.id,
            classId: s.classId,
            section: s.class?.section ?? null,
            discountPercent: s.fee.discountPercent,
            amountPaid: s.fee.amountPaid,
            residencyType: s.residencyType,
          },
          cache
        );
        studentsRecalculated += 1;
      }
    });

    const afterExtras = await loadSchoolExtras(schoolId);
    const afterIssues = findMessFeeDuplicateIssues(afterExtras, classes);
    const afterCount = countMessDuplicateExtraFeeIds(afterIssues);

    return NextResponse.json({
      message:
        beforeCount > 0 || hostelMessCleaned || installmentPairsRepaired > 0
          ? "Mess fee rows repaired or duplicates removed; student totals recalculated"
          : "No duplicate mess fees found",
      removedDuplicateRows: Math.max(0, beforeCount - afterCount),
      installmentPairsRepaired,
      hostelMessCleaned,
      studentsRecalculated,
      remainingIssues: afterIssues,
      remainingDuplicateCount: afterCount,
    });
  } catch (error: unknown) {
    console.error("POST cleanup-duplicates error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
