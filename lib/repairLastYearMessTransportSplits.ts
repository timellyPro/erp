import prisma from "@/lib/db";
import { installmentIndexFromName } from "@/lib/extraFeeInstallments";
import {
  isMessCategoryExtraFeeName,
  isStudentHosteller,
} from "@/lib/extraFeeResidencyScope";
import { splitPaymentAllocations, type PaymentAllocationSplit } from "@/lib/splitPaymentAllocations";
import { computeAdminStudentFeeBreakdown, type AdminFeeBreakdownDueHead } from "@/lib/computeAdminStudentFeeBreakdown";

type RepairDb = Pick<
  typeof prisma,
  | "$transaction"
  | "extraFee"
  | "payment"
  | "paymentFeeAllocation"
  | "student"
>;

function isTransportCategoryName(name: string): boolean {
  return String(name ?? "").toLowerCase().includes("transport");
}

type ExtraFeeDueHead = Extract<AdminFeeBreakdownDueHead, { headType: "EXTRA_FEE" }>;

function isExtraFeeDueHead(
  head: AdminFeeBreakdownDueHead
): head is ExtraFeeDueHead {
  return head.headType === "EXTRA_FEE";
}

function findExtraFeeDueHead(
  dueHeads: AdminFeeBreakdownDueHead[],
  predicate: (head: ExtraFeeDueHead) => boolean
): ExtraFeeDueHead | undefined {
  return dueHeads.find((head): head is ExtraFeeDueHead => isExtraFeeDueHead(head) && predicate(head));
}

/**
 * When a payment was posted entirely to "Last Year Fee Due" but the receipt / intent
 * was mess + transport (common data-entry mistake), split allocations so Fees Sheet
 * and transaction history show the correct heads.
 */
export async function repairLastYearMessTransportSplits(
  db: RepairDb,
  schoolId: string,
  options?: { studentId?: string; dryRun?: boolean }
): Promise<{ scanned: number; repaired: number; skipped: number }> {
  let scanned = 0;
  let repaired = 0;
  let skipped = 0;

  const lastYearExtras = await db.extraFee.findMany({
    where: {
      schoolId,
      name: { contains: "Last Year", mode: "insensitive" },
      targetStudentId: options?.studentId ? options.studentId : { not: null },
    },
    select: { id: true, targetStudentId: true, name: true, amount: true },
  });
  if (lastYearExtras.length === 0) {
    return { scanned, repaired, skipped };
  }

  const lastYearIds = lastYearExtras.map((e) => e.id);
  const lastYearByStudent = new Map(
    lastYearExtras.filter((e) => e.targetStudentId).map((e) => [e.targetStudentId!, e])
  );

  const candidateAllocs = await db.paymentFeeAllocation.findMany({
    where: {
      extraFeeId: { in: lastYearIds },
      allocationType: "PAYMENT",
      headType: "EXTRA_FEE",
    },
    select: {
      id: true,
      paymentId: true,
      studentId: true,
      allocatedAmount: true,
      payment: { select: { amount: true, status: true } },
    },
  });

  const paymentIds = [...new Set(candidateAllocs.map((a) => a.paymentId))];
  const allPaymentAllocs =
    paymentIds.length > 0
      ? await db.paymentFeeAllocation.findMany({
          where: { paymentId: { in: paymentIds }, allocationType: "PAYMENT" },
          select: { paymentId: true, extraFeeId: true, allocatedAmount: true },
        })
      : [];
  const allocCountByPayment = new Map<string, number>();
  for (const row of allPaymentAllocs) {
    allocCountByPayment.set(row.paymentId, (allocCountByPayment.get(row.paymentId) ?? 0) + 1);
  }

  for (const alloc of candidateAllocs) {
    if ((allocCountByPayment.get(alloc.paymentId) ?? 0) !== 1) continue;
    if (alloc.payment.status !== "SUCCESS" && alloc.payment.status !== "COMPLETED") continue;
    if (Math.abs(alloc.allocatedAmount - alloc.payment.amount) > 0.02) continue;

    const lastYearExtra = lastYearByStudent.get(alloc.studentId);
    if (!lastYearExtra) continue;

    scanned += 1;

    const student = await db.student.findUnique({
      where: { id: alloc.studentId },
      select: { id: true, residencyType: true, schoolId: true },
    });
    if (!student || student.schoolId !== schoolId) {
      skipped += 1;
      continue;
    }
    if (isStudentHosteller(student.residencyType)) {
      skipped += 1;
      continue;
    }

    const breakdown = await computeAdminStudentFeeBreakdown(schoolId, alloc.studentId, {
      migrateLumps: false,
      reconcileTotals: false,
    });

    const messHead = findExtraFeeDueHead(
      breakdown.dueHeads,
      (h) => isMessCategoryExtraFeeName(h.label) && installmentIndexFromName(h.label) === 1
    );
    const transportHead = findExtraFeeDueHead(
      breakdown.dueHeads,
      (h) => isTransportCategoryName(h.label) && installmentIndexFromName(h.label) === 1
    );
    if (!messHead || !transportHead) {
      skipped += 1;
      continue;
    }

    const messUnpaid = messHead.dueBefore;
    const transportUnpaid = transportHead.dueBefore;

    if (messUnpaid <= 0.01 && transportUnpaid <= 0.01) {
      skipped += 1;
      continue;
    }

    const paymentAmount = alloc.payment.amount;
    const transportPay = Math.min(transportUnpaid, transportHead.snapshotAmount, paymentAmount);
    let remaining = paymentAmount - transportPay;
    const messPay = Math.min(messUnpaid, messHead.snapshotAmount, remaining);
    remaining -= messPay;
    const lastYearPay = Math.max(remaining, 0);

    if (messPay <= 0.01 && transportPay <= 0.01) {
      skipped += 1;
      continue;
    }

    if (Math.abs(messPay + transportPay + lastYearPay - paymentAmount) > 0.02) {
      skipped += 1;
      continue;
    }

    const splits: PaymentAllocationSplit[] = [];
    if (transportPay > 0.01) {
      splits.push({
        headType: "EXTRA_FEE",
        extraFeeId: transportHead.extraFeeId,
        componentName: transportHead.label,
        allocatedAmount: Math.round(transportPay * 100) / 100,
      });
    }
    if (messPay > 0.01) {
      splits.push({
        headType: "EXTRA_FEE",
        extraFeeId: messHead.extraFeeId,
        componentName: messHead.label,
        allocatedAmount: Math.round(messPay * 100) / 100,
      });
    }
    if (lastYearPay > 0.01) {
      splits.push({
        headType: "EXTRA_FEE",
        extraFeeId: lastYearExtra.id,
        componentName: lastYearExtra.name.trim(),
        allocatedAmount: Math.round(lastYearPay * 100) / 100,
      });
    }

    if (options?.dryRun) {
      repaired += 1;
      continue;
    }

    await splitPaymentAllocations(db, alloc.paymentId, splits, {
      schoolId,
      studentId: alloc.studentId,
    });
    repaired += 1;
  }

  return { scanned, repaired, skipped };
}
