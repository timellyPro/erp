import prisma from "@/lib/db";
import type { DayReportTx } from "@/lib/feeDayReportExcel";
import { loadAdmissionFeeDayReportTransactions } from "@/lib/loadAdmissionFeeDayReportTx";
import {
  resolvePaymentCollectorDisplayName,
  userCollectorDisplayLabel,
} from "@/lib/paymentCollectorLabel";
import { FEE_COLLECTION_PAYMENT_WHERE } from "@/lib/schoolDashboardCollection";

/** Local calendar bounds for fee reports: [fromYmd 00:00, toYmd+1 00:00). */
export function feeReportRangeBounds(
  fromYmd: string,
  toYmd: string
): { start: Date; end: Date; admissionTo: Date } | null {
  const fromParts = fromYmd.trim().split("-").map((v) => Number(v));
  const toParts = (toYmd.trim() || fromYmd.trim()).split("-").map((v) => Number(v));
  const y = fromParts[0];
  const m = fromParts[1];
  const d = fromParts[2];
  const ty = toParts[0];
  const tm = toParts[1];
  const td = toParts[2];
  if (!y || !m || !d || !ty || !tm || !td) return null;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(ty, tm - 1, td + 1, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) return null;
  return { start, end, admissionTo: new Date(end.getTime() - 1) };
}

/** Fee payments + admission records for a report date range (day / month / year). */
export async function loadFeeReportTransactions(
  schoolId: string,
  fromYmd: string,
  toYmd: string,
  options?: { collectedByUserId?: string }
): Promise<DayReportTx[]> {
  const bounds = feeReportRangeBounds(fromYmd, toYmd);
  if (!bounds) return [];
  return loadFeeReportTransactionsInRange(
    schoolId,
    bounds.start,
    bounds.end,
    bounds.admissionTo,
    options
  );
}

/** Successful fee payments + admission records for [start, end) local calendar range. */
export async function loadDayFeeCollectionTransactions(
  schoolId: string,
  collectionStart: Date,
  collectionEnd: Date
): Promise<DayReportTx[]> {
  const admissionTo = new Date(collectionEnd.getTime() - 1);
  return loadFeeReportTransactionsInRange(schoolId, collectionStart, collectionEnd, admissionTo);
}

async function loadFeeReportTransactionsInRange(
  schoolId: string,
  rangeStart: Date,
  rangeEndExclusive: Date,
  admissionTo: Date,
  options?: { collectedByUserId?: string }
): Promise<DayReportTx[]> {
  const paymentWhere = {
    student: { schoolId },
    ...FEE_COLLECTION_PAYMENT_WHERE,
    createdAt: { gte: rangeStart, lt: rangeEndExclusive },
    ...(options?.collectedByUserId ? { collectedByUserId: options.collectedByUserId } : {}),
  };

  const [payments, admissionTxs] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        amount: true,
        gateway: true,
        transactionId: true,
        hyperpgTxnId: true,
        createdAt: true,
        collectedByName: true,
        collectedByUserId: true,
        collectedBy: { select: { name: true, email: true } },
        student: {
          select: {
            admissionNumber: true,
            user: { select: { name: true } },
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    options?.collectedByUserId
      ? Promise.resolve([])
      : loadAdmissionFeeDayReportTransactions(schoolId, rangeStart, admissionTo),
  ]);

  const paymentIds = payments.map((p) => p.id);
  const paymentAllocations =
    paymentIds.length > 0
      ? await prisma.paymentFeeAllocation.findMany({
          where: {
            paymentId: { in: paymentIds },
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
        })
      : [];

  const extraFeeIds = Array.from(
    new Set(
      paymentAllocations
        .filter((a) => a.headType === "EXTRA_FEE" && !!a.extraFeeId)
        .map((a) => a.extraFeeId as string)
    )
  );
  const extraFees =
    extraFeeIds.length > 0
      ? await prisma.extraFee.findMany({
          where: { id: { in: extraFeeIds } },
          select: { id: true, name: true },
        })
      : [];
  const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));

  const allocationLabelAmountByPayment = new Map<string, Map<string, number>>();
  for (const a of paymentAllocations) {
    if (a.allocatedAmount <= 0.00001) continue;
    let label = "Default";
    if (a.headType === "BASE_COMPONENT") {
      label =
        a.componentName ||
        (typeof a.componentIndex === "number" ? `Component ${a.componentIndex + 1}` : "School Fees");
    } else if (a.headType === "EXTRA_FEE") {
      label = a.extraFeeId ? (extraFeeNameById.get(a.extraFeeId) ?? "Extra Fee") : "Extra Fee";
    }
    const perPayment = allocationLabelAmountByPayment.get(a.paymentId) ?? new Map<string, number>();
    allocationLabelAmountByPayment.set(a.paymentId, perPayment);
    perPayment.set(label, (perPayment.get(label) ?? 0) + a.allocatedAmount);
  }

  const dominantFeeTypeByPayment = new Map<string, { name: string; amount: number }>();
  for (const [paymentId, labelMap] of allocationLabelAmountByPayment.entries()) {
    let bestName = "Default";
    let bestAmount = 0;
    for (const [name, amt] of labelMap.entries()) {
      if (amt > bestAmount) {
        bestAmount = amt;
        bestName = name;
      }
    }
    dominantFeeTypeByPayment.set(paymentId, { name: bestName, amount: bestAmount });
  }

  const collectorUserIds = Array.from(
    new Set(
      payments
        .map((p) => p.collectedByUserId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const collectorUsers =
    collectorUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: collectorUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

  const collectorLabelByUserId = new Map<string, string>();
  for (const user of collectorUsers) {
    const label = userCollectorDisplayLabel(user);
    if (label) collectorLabelByUserId.set(user.id, label);
  }

  const paymentTxs: DayReportTx[] = payments.map((p) => {
    const perHead = allocationLabelAmountByPayment.get(p.id);
    const feeAllocations = perHead
      ? Array.from(perHead.entries()).map(([name, amount]) => ({ name, amount }))
      : [];
    const dominant = dominantFeeTypeByPayment.get(p.id);
    return {
      id: p.id,
      amount: p.amount,
      gateway: p.gateway,
      createdAt: p.createdAt.toISOString(),
      transactionId: p.transactionId,
      hyperpgTxnId: p.hyperpgTxnId,
      collectedByName:
        resolvePaymentCollectorDisplayName(
          p.collectedByName,
          p.collectedBy,
          p.collectedByUserId,
          collectorLabelByUserId
        ) ?? p.collectedByName?.trim() ?? null,
      collectedByUserId: p.collectedByUserId ?? null,
      feeTypeName: dominant?.name ?? "Default",
      feeAllocations,
      student: p.student,
    };
  });

  return [...paymentTxs, ...admissionTxs];
}
