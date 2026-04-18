import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import { structureMultiplierAfterDiscount } from "@/lib/studentTuitionFromStructure";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json(
      { message: "Only school staff can view fee summary" },
      { status: 403 }
    );
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }
    const fees = await prisma.studentFee.findMany({
      where: { student: { schoolId } },
      include: {
        student: {
          select: {
            id: true,
            class: { select: { id: true, name: true, section: true } },
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const studentIds = fees.map((f) => f.studentId);

    const classIds = Array.from(
      new Set(
        fees
          .map((f) => f.student.class?.id)
          .filter((x): x is string => typeof x === "string" && x.length > 0)
      )
    );

    const structures = await prisma.classFeeStructure.findMany({
      where: { classId: { in: classIds } },
      select: { classId: true, components: true },
    });

    const componentsByClassId = new Map<string, Array<{ name: string; amount: number }>>(
      structures.map((s) => [
        s.classId,
        (Array.isArray(s.components) ? (s.components as any[]) : []).map((c) => ({
          name: String(c?.name ?? "Component"),
          amount: Number(c?.amount ?? 0) || 0,
        })),
      ])
    );

    const extraFees = await prisma.extraFee.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        amount: true,
        targetType: true,
        targetClassId: true,
        targetSection: true,
        targetStudentId: true,
      },
    });

    // Pick the fee-head that was allocated in the latest SUCCESS payment for each student.
    // This keeps the UI to "only one" fee type (the last one they selected).
    const latestPayments = await prisma.payment.findMany({
      where: {
        studentId: { in: studentIds },
        status: "SUCCESS",
        purpose: "FEES",
      },
      distinct: ["studentId"],
      orderBy: [{ studentId: "asc" }, { createdAt: "desc" }],
      select: { id: true, studentId: true },
    });

    const latestPaymentIdByStudentId = new Map(latestPayments.map((p) => [p.studentId, p.id]));
    const latestPaymentIds = Array.from(latestPaymentIdByStudentId.values());

    const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));

    const selectedHeadByStudentId = new Map<
      string,
      { headKey: string; label: string }
    >();

    if (latestPaymentIds.length > 0) {
      const latestPaymentAllocations = await prisma.paymentFeeAllocation.findMany({
        where: {
          paymentId: { in: latestPaymentIds },
          allocationType: "PAYMENT",
        },
        select: {
          paymentId: true,
          headType: true,
          componentIndex: true,
          componentName: true,
          extraFeeId: true,
          allocatedAmount: true,
        },
      });

      const studentIdByPaymentId = new Map(latestPayments.map((p) => [p.id, p.studentId]));

      const headAmountByPaymentId = new Map<
        string,
        Map<string, { headKey: string; label: string; amount: number }>
      >();

      for (const a of latestPaymentAllocations) {
        if (a.allocatedAmount <= 0.00001) continue;
        const studentId = studentIdByPaymentId.get(a.paymentId);
        if (!studentId) continue;

        let headKey = "";
        let label = "";
        if (a.headType === "BASE_COMPONENT") {
          const idx = typeof a.componentIndex === "number" ? a.componentIndex : null;
          if (idx === null) continue;
          headKey = `BASE:${idx}`;
          label = a.componentName || `Component ${idx + 1}`;
        } else if (a.headType === "EXTRA_FEE") {
          if (!a.extraFeeId) continue;
          headKey = `EXTRA:${a.extraFeeId}`;
          label = extraFeeNameById.get(a.extraFeeId) ?? "Extra Fee";
        } else {
          continue;
        }

        const perPayment = headAmountByPaymentId.get(a.paymentId) ?? new Map();
        headAmountByPaymentId.set(a.paymentId, perPayment);

        const existing = perPayment.get(headKey);
        if (!existing) {
          perPayment.set(headKey, { headKey, label, amount: a.allocatedAmount });
        } else {
          perPayment.set(headKey, { ...existing, amount: existing.amount + a.allocatedAmount });
        }
      }

      for (const [paymentId, perHead] of headAmountByPaymentId.entries()) {
        const studentId = studentIdByPaymentId.get(paymentId);
        if (!studentId) continue;

        let best: { headKey: string; label: string; amount: number } | null = null;
        for (const v of perHead.values()) {
          if (!best || v.amount > best.amount) best = v;
        }
        if (best) selectedHeadByStudentId.set(studentId, { headKey: best.headKey, label: best.label });
      }
    }

    const [paymentAllocs, refundAllocs] = await Promise.all([
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId: { in: studentIds },
          allocationType: "PAYMENT",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: {
          studentId: true,
          headType: true,
          componentIndex: true,
          componentName: true,
          extraFeeId: true,
          allocatedAmount: true,
        },
      }),
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId: { in: studentIds },
          allocationType: "REFUND",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: {
          studentId: true,
          headType: true,
          componentIndex: true,
          componentName: true,
          extraFeeId: true,
          allocatedAmount: true,
        },
      }),
    ]);

    const netPaidByStudentHead = new Map<string, number>(); // `${studentId}|${headKey}`
    const allocationsNetTotalByStudent = new Map<string, number>();

    const addNet = (studentId: string, headKey: string, delta: number) => {
      const composedKey = `${studentId}|${headKey}`;
      netPaidByStudentHead.set(composedKey, (netPaidByStudentHead.get(composedKey) ?? 0) + delta);
      allocationsNetTotalByStudent.set(studentId, (allocationsNetTotalByStudent.get(studentId) ?? 0) + delta);
    };

    for (const a of paymentAllocs) {
      if (a.headType === "BASE_COMPONENT") {
        if (typeof a.componentIndex !== "number") continue;
        addNet(a.studentId, `BASE:${a.componentIndex}`, a.allocatedAmount);
      } else if (a.headType === "EXTRA_FEE") {
        if (!a.extraFeeId) continue;
        addNet(a.studentId, `EXTRA:${a.extraFeeId}`, a.allocatedAmount);
      }
    }
    for (const a of refundAllocs) {
      if (a.headType === "BASE_COMPONENT") {
        if (typeof a.componentIndex !== "number") continue;
        addNet(a.studentId, `BASE:${a.componentIndex}`, -a.allocatedAmount);
      } else if (a.headType === "EXTRA_FEE") {
        if (!a.extraFeeId) continue;
        addNet(a.studentId, `EXTRA:${a.extraFeeId}`, -a.allocatedAmount);
      }
    }

    const feesWithTypes = fees.map((fee) => {
      const studentId = fee.studentId;
      const classId = fee.student.class?.id ?? null;
      const classSection = fee.student.class?.section ?? null;

      const selectedHead = selectedHeadByStudentId.get(studentId) ?? null;
      const targetHeadKey = selectedHead?.headKey ?? null;

      const structMult = structureMultiplierAfterDiscount(fee.discountPercent);
      const totalSnapshotDue = Math.max(fee.finalFee, 0);
      const allocationsNetTotal = allocationsNetTotalByStudent.get(studentId) ?? 0;
      const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);

      const baseComponents = classId ? componentsByClassId.get(classId) ?? [] : [];

      const applicableExtraFees = extraFees.filter((ef) => {
        if (ef.targetType === "SCHOOL") return true;
        if (ef.targetType === "CLASS") return !!classId && ef.targetClassId === classId;
        if (ef.targetType === "SECTION")
          return !!classId && ef.targetClassId === classId && ef.targetSection === classSection;
        if (ef.targetType === "STUDENT") return ef.targetStudentId === studentId;
        return false;
      });

      let selectedDueLabel = selectedHead?.label ?? "-";
      let selectedDueAmount = 0;

      for (let i = 0; i < baseComponents.length; i++) {
        const headKey = `BASE:${i}`;
        const snapshotDue = baseComponents[i].amount * structMult;
        const paidAlloc = netPaidByStudentHead.get(`${studentId}|${headKey}`) ?? 0;
        const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (snapshotDue / totalSnapshotDue) : 0;
        const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
        const dueBefore = Math.max(snapshotDue - paidBefore, 0);
        if (targetHeadKey && headKey === targetHeadKey) {
          selectedDueAmount = dueBefore;
        } else if (!targetHeadKey) {
          // Fallback: show the head with the highest remaining due.
          if (dueBefore > 0.01 && dueBefore > selectedDueAmount) {
            selectedDueAmount = dueBefore;
            selectedDueLabel = baseComponents[i].name || `Component ${i + 1}`;
          }
        }
      }

      for (const ef of applicableExtraFees) {
        const headKey = `EXTRA:${ef.id}`;
        const snapshotDue = Number(ef.amount) || 0;
        const paidAlloc = netPaidByStudentHead.get(`${studentId}|${headKey}`) ?? 0;
        const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (snapshotDue / totalSnapshotDue) : 0;
        const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
        const dueBefore = Math.max(snapshotDue - paidBefore, 0);
        if (targetHeadKey && headKey === targetHeadKey) {
          selectedDueAmount = dueBefore;
        } else if (!targetHeadKey) {
          // Fallback: show the head with the highest remaining due.
          if (dueBefore > 0.01 && dueBefore > selectedDueAmount) {
            selectedDueAmount = dueBefore;
            selectedDueLabel = ef.name;
          }
        }
      }

      return {
        ...fee,
        feeTypes: selectedDueLabel,
        feeTypeDueAmount: selectedDueAmount,
      };
    });

    const stats = fees.reduce(
      (acc, fee) => {
        acc.totalStudents += 1;
        acc.totalCollected += fee.amountPaid;
        acc.totalDue += fee.remainingFee;
        if (fee.remainingFee <= 0) {
          acc.paid += 1;
        } else {
          acc.pending += 1;
        }
        return acc;
      },
      { totalStudents: 0, paid: 0, pending: 0, totalCollected: 0, totalDue: 0 }
    );

    return NextResponse.json({ fees: feesWithTypes, stats }, { status: 200 });
  } catch (error: any) {
    console.error("Fee summary error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

