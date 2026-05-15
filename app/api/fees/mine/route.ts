import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { redistributeBaseMinusOneAllocations } from "@/lib/redistributeBaseMinusOneAllocations";
import { structureMultiplierAfterDiscount } from "@/lib/studentTuitionFromStructure";
import { extraFeeAppliesToStudent } from "@/lib/extraFeeResidencyScope";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STUDENT" || !session.user.studentId) {
    return NextResponse.json(
      { message: "Only students can view their fee details" },
      { status: 403 }
    );
  }

  try {
    const studentId = session.user.studentId;

    const fee = await prisma.studentFee.findUnique({
      where: { studentId },
      include: {
        student: {
          select: {
            classId: true,
            schoolId: true,
            residencyType: true,
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
    });

    if (!fee) {
      return NextResponse.json(
        { message: "Fee details not found for this student" },
        { status: 404 }
      );
    }

    const classId = fee.student.classId;
    const components =
      classId
        ? await prisma.classFeeStructure.findUnique({
            where: { classId },
            select: { components: true },
          })
        : null;

    const extraFeesRaw = await prisma.extraFee.findMany({
      where: {
        schoolId: fee.student.schoolId,
        OR: [
          { targetType: "SCHOOL" },
          { targetType: "STUDENT", targetStudentId: studentId },
          ...(classId ? [{ targetType: "CLASS", targetClassId: classId }] : []),
          ...(classId && fee.student.class?.section
            ? [
                {
                  targetType: "SECTION",
                  targetClassId: classId,
                  targetSection: fee.student.class.section,
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        amount: true,
        targetType: true,
        targetClassId: true,
        targetSection: true,
        targetStudentId: true,
        residencyScope: true,
      },
    });
    const residency = fee.student.residencyType ?? "Day Scholar";
    const extraFees = extraFeesRaw
      .filter((ef) => extraFeeAppliesToStudent({ name: ef.name, residencyScope: ef.residencyScope }, residency))
      .filter((ef) => !(isStudentRte(residency) && isTuitionNamedExtraFee(ef.name)));

    const payments = await prisma.payment.findMany({
      where: { studentId, eventRegistrationId: null },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const paymentIds = payments.map((p) => p.id);
    let refunds: { id: string; paymentId: string; amount: number; status: string; createdAt: Date }[] = [];
    if (paymentIds.length > 0) {
      const placeholders = paymentIds.map((_, i) => `$${i + 1}`).join(", ");
      refunds = (await prisma.$queryRawUnsafe(
        `SELECT id, "paymentId", amount, status, "createdAt" FROM "Refund" WHERE "paymentId" IN (${placeholders}) AND status = 'SUCCESS' ORDER BY "createdAt" DESC`,
        ...paymentIds
      )) as { id: string; paymentId: string; amount: number; status: string; createdAt: Date }[];
    }

    // Due amount per fee head (tuition + base components + applicable extra fees)
    const baseComponents =
      ((components?.components as Array<{ name: string; amount: number }>) || []).map((c) => ({
        name: String(c.name),
        amount: Number(c.amount) || 0,
      }));

    const structMult = structureMultiplierAfterDiscount(fee.discountPercent);
    const rte = isStudentRte(residency);

    type HeadKey =
      | { key: string; headType: "BASE_COMPONENT"; componentIndex: number; label: string; snapshotDue: number }
      | { key: string; headType: "EXTRA_FEE"; extraFeeId: string; label: string; snapshotDue: number };

    const heads: HeadKey[] = [
      ...baseComponents.map((c, idx) => ({
        key: `BASE:${idx}`,
        headType: "BASE_COMPONENT" as const,
        componentIndex: idx,
        label: c.name,
        snapshotDue: rte ? 0 : c.amount * structMult,
      })),
      ...extraFees.map((ef) => ({
        key: `EXTRA:${ef.id}`,
        headType: "EXTRA_FEE" as const,
        extraFeeId: ef.id,
        label: ef.name,
        snapshotDue: Number(ef.amount) || 0,
      })),
    ];

    const [paymentAllocations, refundAllocations] = await Promise.all([
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId,
          allocationType: "PAYMENT",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: { headType: true, componentIndex: true, extraFeeId: true, allocatedAmount: true },
      }),
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId,
          allocationType: "REFUND",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: { headType: true, componentIndex: true, extraFeeId: true, allocatedAmount: true },
      }),
    ]);

    const netPaidByHead = new Map<string, number>();
    for (const a of paymentAllocations) {
      const key =
        a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
      netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) + a.allocatedAmount);
    }
    for (const a of refundAllocations) {
      const key =
        a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
      netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) - a.allocatedAmount);
    }

    redistributeBaseMinusOneAllocations(
      netPaidByHead,
      heads.map((h) => ({ key: h.key, snapshotDue: h.snapshotDue }))
    );

    const allocationsNetTotal = Array.from(netPaidByHead.values()).reduce((s, v) => s + v, 0);
    const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);
    const totalSnapshotDue = Math.max(heads.reduce((s, h) => s + h.snapshotDue, 0), 0);

    const dueHeads = heads.map((h) => {
      const paidAlloc = netPaidByHead.get(h.key) ?? 0;
      const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (h.snapshotDue / totalSnapshotDue) : 0;
      const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
      const dueBefore = Math.max(h.snapshotDue - paidBefore, 0);
      return {
        key: h.key,
        headType: h.headType,
        label: h.label,
        dueBefore,
      };
    });

    const rawComponents = (components?.components as Array<{ name: string; amount: number }>) || [];
    const payload = {
      fee: {
        ...fee,
        components: rte ? rawComponents.map((c) => ({ ...c, amount: 0 })) : rawComponents,
        extraFees,
        payments,
        refunds,
        dueHeads,
      },
    };
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Fetch student fee error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

