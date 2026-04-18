import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { redistributeBaseMinusOneAllocations } from "@/lib/redistributeBaseMinusOneAllocations";

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
    const { studentId, amount: rawAmount, paymentMode, refNo, transactionId, selectedHeads: rawSelectedHeads } = body;

    const amount = typeof rawAmount === "string" ? parseFloat(rawAmount) : rawAmount;
    if (!studentId || typeof amount !== "number" || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ message: "studentId and amount (positive number) required" }, { status: 400 });
    }

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: { fee: true, class: true },
    });

    if (!student) {
      return NextResponse.json({ message: "Student not found in your school" }, { status: 404 });
    }

    if (!student.fee) {
      return NextResponse.json({ message: "Fee record not found for this student" }, { status: 404 });
    }

    const fee = student.fee;

    type SelectedHead =
      | { headType: "BASE_COMPONENT"; componentIndex: number; componentName?: string }
      | { headType: "EXTRA_FEE"; extraFeeId: string };

    const normalizedSelectedHeads: SelectedHead[] = Array.isArray(rawSelectedHeads)
      ? rawSelectedHeads
          .map((h: any): SelectedHead | null => {
            if (!h || typeof h !== "object") return null;
            if (h.headType === "BASE_COMPONENT" && typeof h.componentIndex === "number") {
              return {
                headType: "BASE_COMPONENT",
                componentIndex: h.componentIndex,
                componentName: typeof h.componentName === "string" ? h.componentName : undefined,
              };
            }
            if (h.headType === "EXTRA_FEE" && typeof h.extraFeeId === "string") {
              return { headType: "EXTRA_FEE", extraFeeId: h.extraFeeId };
            }
            return null;
          })
          .filter((x): x is SelectedHead => x !== null)
      : [];

    const classFeeStructure = student.class?.id
      ? await prisma.classFeeStructure.findUnique({
          where: { classId: student.class.id },
          select: { components: true },
        })
      : null;

    const baseComponents =
      ((classFeeStructure?.components as Array<{ name: string; amount: number }>) ?? []).map((c) => ({
        name: c.name,
        amount: Number(c.amount) || 0,
      }));

    const discountRatio = fee.totalFee > 0 ? fee.finalFee / fee.totalFee : 1;

    const classId = student.class?.id ?? null;
    const classSection = student.class?.section ?? null;

    const extraFees = await prisma.extraFee.findMany({
      where: {
        schoolId,
        OR: [
          { targetType: "SCHOOL" },
          ...(classId ? [{ targetType: "CLASS", targetClassId: classId }] : []),
          ...(classId && classSection
            ? [{ targetType: "SECTION", targetClassId: classId, targetSection: classSection }]
            : []),
          { targetType: "STUDENT", targetStudentId: student.id },
        ],
      },
      select: { id: true, name: true, amount: true, targetType: true },
    });

    type Head =
      | { key: string; headType: "BASE_COMPONENT"; componentIndex: number; componentName: string; snapshotDue: number }
      | { key: string; headType: "EXTRA_FEE"; extraFeeId: string; extraFeeName: string; snapshotDue: number };

    const allHeads: Head[] = [];
    baseComponents.forEach((c, idx) => {
      allHeads.push({
        key: `BASE:${idx}`,
        headType: "BASE_COMPONENT",
        componentIndex: idx,
        componentName: c.name,
        snapshotDue: Math.round(c.amount * discountRatio * 100) / 100,
      });
    });
    for (const ef of extraFees) {
      allHeads.push({
        key: `EXTRA:${ef.id}`,
        headType: "EXTRA_FEE",
        extraFeeId: ef.id,
        extraFeeName: ef.name,
        snapshotDue: Math.round((Number(ef.amount) || 0) * discountRatio * 100) / 100,
      });
    }

    const getHeadKey = (h: SelectedHead) => {
      if (h.headType === "BASE_COMPONENT") return `BASE:${h.componentIndex}`;
      return `EXTRA:${h.extraFeeId}`;
    };

    // Net already-paid by head via allocations (new payments only).
    const [paymentAllocations, refundAllocations] = await Promise.all([
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId: student.id,
          allocationType: "PAYMENT",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: { headType: true, componentIndex: true, componentName: true, extraFeeId: true, allocatedAmount: true },
      }),
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId: student.id,
          allocationType: "REFUND",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: { headType: true, componentIndex: true, componentName: true, extraFeeId: true, allocatedAmount: true },
      }),
    ]);

    const netPaidByHead = new Map<string, number>();
    for (const a of paymentAllocations) {
      const key =
        a.headType === "BASE_COMPONENT"
          ? `BASE:${a.componentIndex}`
          : `EXTRA:${a.extraFeeId}`;
      netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) + a.allocatedAmount);
    }
    for (const a of refundAllocations) {
      const key =
        a.headType === "BASE_COMPONENT"
          ? `BASE:${a.componentIndex}`
          : `EXTRA:${a.extraFeeId}`;
      netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) - a.allocatedAmount);
    }

    redistributeBaseMinusOneAllocations(
      netPaidByHead,
      allHeads.map((h) => ({ key: h.key, snapshotDue: h.snapshotDue }))
    );

    const allocationsNetTotal = Array.from(netPaidByHead.values()).reduce((s, v) => s + v, 0);
    const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);

    const totalSnapshotDue = Math.max(allHeads.reduce((s, h) => s + h.snapshotDue, 0), 0);

    const headsWithDueBefore: Array<Head & { paidBefore: number; dueBefore: number }> = allHeads.map((h) => {
      const paidAlloc = netPaidByHead.get(h.key) ?? 0;
      const paidLegacy =
        totalSnapshotDue > 0 ? legacyPaidTotal * (h.snapshotDue / totalSnapshotDue) : 0;
      const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
      const dueBefore = Math.max(h.snapshotDue - paidBefore, 0);
      return { ...h, paidBefore, dueBefore };
    });

    if (headsWithDueBefore.length === 0) {
      return NextResponse.json({ message: "No fee heads configured for this student" }, { status: 400 });
    }

    const selectedHeadKeys = new Set<string>(
      normalizedSelectedHeads.length > 0
        ? normalizedSelectedHeads.map(getHeadKey)
        : headsWithDueBefore.map((h) => h.key) // Back-compat: no selection => pay all
    );

    const selectedHeads = headsWithDueBefore.filter((h) => selectedHeadKeys.has(h.key));
    const unselectedHeads = headsWithDueBefore.filter((h) => !selectedHeadKeys.has(h.key));

    // Allocate: proportional on selected first, then spill remainder across unselected.
    const selectedDueSum = selectedHeads.reduce((s, h) => s + h.dueBefore, 0);
    const unselectedDueSum = unselectedHeads.reduce((s, h) => s + h.dueBefore, 0);
    const totalDueSum = headsWithDueBefore.reduce((s, h) => s + h.dueBefore, 0);

    if (amount > totalDueSum + 0.01) {
      return NextResponse.json(
        { message: `Amount cannot exceed remaining due (₹${totalDueSum.toFixed(2)})` },
        { status: 400 }
      );
    }

    if (totalDueSum <= 0.00001) {
      return NextResponse.json({ message: "Nothing due for this student" }, { status: 400 });
    }

    const allocateSelected = Math.min(amount, selectedDueSum);
    const spill = amount - allocateSelected;

    const proportionalAlloc = (
      amountToAllocate: number,
      heads: Array<{ key: string; dueBefore: number }>
    ): Map<string, number> => {
      const sum = heads.reduce((s, h) => s + h.dueBefore, 0);
      const out = new Map<string, number>();
      if (amountToAllocate <= 0 || sum <= 0) return out;
      let remaining = amountToAllocate;
      const eligible = heads.filter((h) => h.dueBefore > 0);
      if (eligible.length === 0) return out;
      for (let i = 0; i < eligible.length; i++) {
        const h = eligible[i];
        const value =
          i === eligible.length - 1
            ? Math.min(remaining, h.dueBefore)
            : (amountToAllocate * h.dueBefore) / sum;
        out.set(h.key, (out.get(h.key) ?? 0) + value);
        remaining -= value;
      }
      return out;
    };

    const allocationsByKey = new Map<string, number>();
    const selectedAlloc = proportionalAlloc(
      allocateSelected,
      selectedHeads.map((h) => ({ key: h.key, dueBefore: h.dueBefore }))
    );
    for (const [k, v] of selectedAlloc) allocationsByKey.set(k, v);

    if (spill > 0.00001) {
      if (unselectedDueSum <= 0) {
        // Should not happen if amount <= fee.remainingFee, but guard anyway.
        return NextResponse.json(
          { message: "Selected heads due is full; no other heads to allocate spill amount" },
          { status: 400 }
        );
      }
      const spillAlloc = proportionalAlloc(
        spill,
        unselectedHeads.map((h) => ({ key: h.key, dueBefore: h.dueBefore }))
      );
      for (const [k, v] of spillAlloc) allocationsByKey.set(k, (allocationsByKey.get(k) ?? 0) + v);
    }

    const paymentAllocationsData = Array.from(allocationsByKey.entries())
      .filter(([, v]) => v > 0.00001)
      .map(([key, allocatedAmount]) => {
        if (key.startsWith("BASE:")) {
          const componentIndex = Number(key.slice("BASE:".length));
          const componentName =
            baseComponents[componentIndex]?.name ?? `Component-${componentIndex + 1}`;
          return {
            paymentId: "__PAYMENT_ID__",
            studentId: student.id,
            allocationType: "PAYMENT",
            allocatedAmount,
            headType: "BASE_COMPONENT",
            componentIndex,
            componentName,
            extraFeeId: null,
          };
        }
        const extraFeeId = key.slice("EXTRA:".length);
        const extraFeeName = extraFees.find((ef) => ef.id === extraFeeId)?.name ?? "Extra Fee";
        return {
          paymentId: "__PAYMENT_ID__",
          studentId: student.id,
          allocationType: "PAYMENT",
          allocatedAmount,
          headType: "EXTRA_FEE",
          componentIndex: null,
          componentName: null,
          extraFeeId,
          extraFeeName,
        };
      });

    const newAmountPaid = fee.amountPaid + amount;
    const newRemaining = Math.max(totalSnapshotDue - newAmountPaid, 0);

    const txId = transactionId || refNo || `OFF-${Date.now()}`;

    const paymentAndAllocations = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          studentId,
          amount,
          gateway: "OFFLINE",
          status: "SUCCESS",
          transactionId: txId,
        },
      });

      const allocationsCreateMany = paymentAllocationsData.map((d: any) => ({
        paymentId: payment.id,
        studentId: d.studentId,
        allocationType: d.allocationType,
        allocatedAmount: d.allocatedAmount,
        headType: d.headType,
        componentIndex: d.componentIndex,
        componentName: d.componentName,
        extraFeeId: d.extraFeeId,
      }));

      if (allocationsCreateMany.length > 0) {
        await tx.paymentFeeAllocation.createMany({ data: allocationsCreateMany });
      }

      await tx.studentFee.update({
        where: { studentId },
        data: { amountPaid: newAmountPaid, remainingFee: newRemaining },
      });

      return payment;
    });

    return NextResponse.json(
      { payment: paymentAndAllocations, message: "Payment recorded successfully" },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Offline payment error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
