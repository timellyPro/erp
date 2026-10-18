import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { extraFeeAppliesToStudent } from "@/lib/fees/extraFeeResidencyScope";
import { snapshotExtraFeeNameOnAllocations } from "@/lib/fees/backfillPaymentAllocationComponentNames";
import { patchExtraFeeWithInstallmentSupport } from "@/lib/fees/extraFeeInstallmentDb";
import { invalidateSchoolFeeReadCaches } from "@/lib/fees/studentFeeReadCache";
import { applyStudentFeeDelta } from "@/lib/fees/applyStoredFeeDelta";
import { auditActorFromSession } from "@/lib/fees/paymentAudit";
import {
  describeExtraFeeChange,
  extraFeeAuditSnapshot,
  recordFeeAudit,
} from "@/lib/fees/feeAudit";
import { logger } from "@/lib/logger";

const patchExtraFeeBodySchema = z.object({
  name: z.string().optional(),
  amount: z.number().optional(),
  splitIntoTwoInstallments: z.boolean().optional(),
  combinedInstallmentTotal: z.number().optional(),
});

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

async function eligibleStudentIdsForExtra(
  extraFee: {
    name: string;
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
    .filter((s) =>
      extraFeeAppliesToStudent(
        { name: extraFee.name, residencyScope: extraFee.residencyScope },
        s.residencyType
      )
    )
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
    return await runInTenantScope(schoolId, async (schoolId) => {

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
    if (!isAdmin && extraFee.targetType !== "STUDENT") {
      return NextResponse.json(
        { message: "Only a school admin can change a school, class or section fee" },
        { status: 403 }
      );
    }

    const parsedBody = patchExtraFeeBodySchema.safeParse(await req.json().catch(() => null));
    const body = parsedBody.success ? parsedBody.data : {};
    logger.info("\n========== EXTRA FEE PATCH ==========");
    logger.info("Fee ID:", id);
    logger.info("Current DB row:", {
      name: extraFee.name,
      amount: extraFee.amount,
      splitIntoTwoInstallments: extraFee.splitIntoTwoInstallments,
      targetType: extraFee.targetType,
    });
    logger.info("Request body:", body);
    logger.info("====================================\n");

    // A rename can move a fee into or out of the Mess/Hostel residency rules, which changes who owes it.
    const eligibleBefore =
      body.name !== undefined ? await eligibleStudentIdsForExtra(extraFee, schoolId) : null;

    const result = await patchExtraFeeWithInstallmentSupport(prisma, extraFee, {
      name: body.name,
      amount: body.amount,
      splitIntoTwoInstallments: body.splitIntoTwoInstallments,
      combinedInstallmentTotal: body.combinedInstallmentTotal,
    });

    if (result === "no_changes") {
      logger.info("[ExtraFee Installments] PATCH result: no changes\n");
      return NextResponse.json({ extraFee });
    }

    const totalAfter = result.totalBefore + result.studentFeeDelta;
    if (eligibleBefore) {
      const eligibleAfter = await eligibleStudentIdsForExtra(
        { ...extraFee, name: result.extraFee.name },
        schoolId
      );
      const before = new Set(eligibleBefore);
      const after = new Set(eligibleAfter);
      await applyStudentFeeDelta(
        eligibleAfter.filter((id) => before.has(id)),
        result.studentFeeDelta
      );
      await applyStudentFeeDelta(
        eligibleAfter.filter((id) => !before.has(id)),
        totalAfter
      );
      await applyStudentFeeDelta(
        eligibleBefore.filter((id) => !after.has(id)),
        -result.totalBefore
      );
    } else if (result.studentFeeDelta !== 0) {
      const eligibleIds = await eligibleStudentIdsForExtra(extraFee, schoolId);
      await applyStudentFeeDelta(eligibleIds, result.studentFeeDelta);
      logger.info("[ExtraFee Installments] Student fee totals adjusted:", {
        studentCount: eligibleIds.length,
        delta: result.studentFeeDelta,
      });
    }

    logger.info("\n========== EXTRA FEE PATCH RESULT ==========");
    logger.info("Action:", result.migrated ? "SPLIT (1 row → 2 rows)" : result.splitApplied ? "UPDATED PAIR" : "SINGLE ROW");
    logger.info("Row IDs now:", result.extraFeeIds);
    logger.info("migrated:", result.migrated, "| splitApplied:", result.splitApplied);
    if (result.migrated) {
      logger.info("✓ Old lump was replaced by two installment rows in the database.");
    } else if (result.splitApplied) {
      logger.info("✓ Both installment rows were updated together.");
    }
    logger.info("============================================\n");

    const totalAfterEdit = result.totalBefore + result.studentFeeDelta;
    const summary =
      describeExtraFeeChange(
        { name: extraFee.name, amount: result.totalBefore },
        { name: result.extraFee.name, amount: totalAfterEdit }
      ) ?? "Saved with no change to name or amount";
    await recordFeeAudit(prisma, {
      schoolId,
      entityType: "EXTRA_FEE",
      entityId: extraFee.id,
      action: "UPDATE",
      actor: auditActorFromSession(session),
      summary: result.migrated ? `${summary}; split into 1st and 2nd installment rows` : summary,
      before: extraFeeAuditSnapshot(extraFee),
      after: extraFeeAuditSnapshot(result.extraFee),
    });

    await invalidateSchoolFeeReadCaches(schoolId);

    return NextResponse.json({
      extraFee: result.extraFee,
      extraFeeIds: result.extraFeeIds,
      splitApplied: result.splitApplied,
      migrated: result.migrated,
    });
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    logger.error("Extra fee PATCH error:", error);
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
    return await runInTenantScope(schoolId, async (schoolId) => {

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
    if (!isAdmin && extraFee.targetType !== "STUDENT") {
      return NextResponse.json(
        { message: "Only a school admin can change a school, class or section fee" },
        { status: 403 }
      );
    }

    const eligibleIds = await eligibleStudentIdsForExtra(extraFee, schoolId);
    await applyStudentFeeDelta(eligibleIds, -extraFee.amount);
    await snapshotExtraFeeNameOnAllocations(prisma, id, extraFee.name);
    await prisma.extraFee.delete({ where: { id } });
    await recordFeeAudit(prisma, {
      schoolId,
      entityType: "EXTRA_FEE",
      entityId: id,
      action: "DELETE",
      actor: auditActorFromSession(session),
      summary: `Deleted "${extraFee.name}" (${extraFee.amount})`,
      before: extraFeeAuditSnapshot(extraFee),
    });

    await invalidateSchoolFeeReadCaches(schoolId);
    return NextResponse.json({ success: true });
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    logger.error("Extra fee DELETE error:", error);
    return NextResponse.json(
      { message: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
