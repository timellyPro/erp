import { tenantDb as prisma } from "@/lib/db/tenantContext";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/fees/feePaymentStatuses";
import { structureMultiplierAfterDiscount } from "@/lib/fees/studentTuitionFromStructure";
import {
  includeExtraFeeOnStudentBill,
  residencyConversionStudentIds,
} from "@/lib/fees/residencyConversion";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/students/studentRte";
import { computeCurrentAndPreviousFeeStats } from "@/lib/fees/computeFeeSummaryStats";
import { activeStudentWhere } from "@/lib/students/studentStatus";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { FEE_LIST_SERVER_CACHE_TTL_MS } from "@/lib/fees/feeListServerCache";

// School-wide stats scan every active student's fee + allocations, so share the
// statsOnly route's cache (same key, purged by invalidateFeeListServerCaches)
// instead of recomputing on every page/cursor.
async function loadStatsCached(schoolId: string) {
  const memKey = `fees:summary:stats:active:${schoolId}`;
  const hit = getSchoolDashboardServerCached<{ stats: Awaited<ReturnType<typeof computeCurrentAndPreviousFeeStats>> }>(memKey);
  if (hit) return hit.stats;
  const stats = await computeCurrentAndPreviousFeeStats(schoolId);
  setSchoolDashboardServerCached(memKey, { fees: [], stats, nextCursor: null }, FEE_LIST_SERVER_CACHE_TTL_MS);
  return stats;
}

/**
 * One cursor-paginated page of the active-student fee summary list, with each
 * row's "current fee type" resolved (the head from the student's latest
 * SUCCESS payment, falling back to the head with the highest remaining due).
 */
export async function loadFeeSummaryPage(schoolId: string, take: number, cursor: string | null) {
  const fees = await prisma.studentFee.findMany({
    where: { student: { schoolId, ...activeStudentWhere } },
    include: {
      student: {
        select: {
          id: true,
          status: true,
          residencyType: true,
          class: { select: { id: true, name: true, section: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { studentId: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { studentId: cursor }, skip: 1 } : {}),
  });

  const hasNext = fees.length > take;
  const pageFees = hasNext ? fees.slice(0, take) : fees;
  const nextCursor = hasNext ? pageFees[pageFees.length - 1]?.studentId ?? null : null;

  const studentIds = pageFees.map((f) => f.studentId);

  // Scoped to the whole school (not just this page's classIds) so this query's args
  // are byte-identical to computeCurrentAndPreviousFeeStats's own classFeeStructure
  // fetch below — the shared prisma extension collapses matching concurrent reads
  // into a single DB round trip instead of two (see lib/db.ts inFlightQueries).
  const [structures, extraFees, latestPayments, stats] = await Promise.all([
    prisma.classFeeStructure.findMany({
      where: { schoolId },
      select: { classId: true, components: true },
    }),
    prisma.extraFee.findMany({
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
        residencyConversion: true,
      },
    }),
    // Pick the fee-head that was allocated in the latest SUCCESS payment for each student.
    // This keeps the UI to "only one" fee type (the last one they selected).
    prisma.payment.findMany({
      where: {
        studentId: { in: studentIds },
        status: "SUCCESS",
        purpose: "FEES",
      },
      distinct: ["studentId"],
      orderBy: [{ studentId: "asc" }, { createdAt: "desc" }],
      select: { id: true, studentId: true },
    }),
    loadStatsCached(schoolId),
  ]);

  const componentsByClassId = new Map<string, Array<{ name: string; amount: number }>>(
    structures.map((s) => [
      s.classId,
      (Array.isArray(s.components) ? (s.components as unknown[]) : []).map((c) => ({
        name: String((c as { name?: string })?.name ?? "Component"),
        amount: Number((c as { amount?: number })?.amount) || 0,
      })),
    ])
  );

  const latestPaymentIdByStudentId = new Map(latestPayments.map((p) => [p.studentId, p.id]));
  const latestPaymentIds = Array.from(latestPaymentIdByStudentId.values());

  const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));

  const selectedHeadByStudentId = new Map<string, { headKey: string; label: string }>();

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

  const feesWithTypes = pageFees.map((fee) => {
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

    const residency = fee.student.residencyType ?? "Day Scholar";
    const convertedStudentIds = residencyConversionStudentIds(extraFees);
    const applicableExtraFees = extraFees.filter((ef) => {
      if (!includeExtraFeeOnStudentBill(ef, residency, studentId, convertedStudentIds))
        return false;
      if (isStudentRte(residency) && isTuitionNamedExtraFee(ef.name)) return false;
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
      const snapshotDue = isStudentRte(residency) ? 0 : baseComponents[i].amount * structMult;
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

  return { fees: feesWithTypes, stats, nextCursor };
}
