import prisma from "@/lib/db";
import { canonicalizeGatewayForStorage } from "@/lib/feePaymentGateway";
import {
  findExistingOfflinePaymentByRef,
  resolveOfflinePaymentTransactionId,
} from "@/lib/offlinePaymentIdempotency";
import {
  allocationKeyFromRecord,
  planSameRefPayment,
  type ExistingPaymentAllocation,
} from "@/lib/offlinePaymentSameRef";
import { FEE_MUTATION_TX } from "@/lib/prismaFeeMutationTx";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";
import { computeAdminStudentFeeBreakdown } from "@/lib/computeAdminStudentFeeBreakdown";
import { reconcileStudentFeeIntegrity } from "@/lib/reconcileStudentFeeIntegrity";
import { roundRupee } from "@/lib/formatRupee";

export type OfflineSelectedHead =
  | { headType: "BASE_COMPONENT"; componentIndex: number; componentName?: string }
  | { headType: "EXTRA_FEE"; extraFeeId: string };

export type OfflineExplicitAllocation = {
  key: string;
  amount: number;
  label?: string;
};

type FastOfflinePaymentInput = {
  schoolId: string;
  studentId: string;
  amount: number;
  paymentMode?: string;
  refNo?: string;
  transactionId?: string;
  paymentDate?: string;
  selectedHeads: OfflineSelectedHead[];
  explicitAllocations: OfflineExplicitAllocation[];
  collectedByUserId?: string;
  collectedByName?: string;
};

function normalizeAllocationKey(raw: string): string {
  const key = raw.trim();
  if (key.startsWith("BASE:")) return key.split("::")[0]!;
  if (key.startsWith("EXTRA:")) return key.split("::")[0]!;
  return key;
}

function headKeyFromSelected(h: OfflineSelectedHead): string {
  if (h.headType === "BASE_COMPONENT") return `BASE:${h.componentIndex}`;
  return `EXTRA:${h.extraFeeId}`;
}

function parsePaymentDate(paymentDate?: string): Date | null {
  if (!paymentDate?.trim()) return null;
  const d = new Date(`${paymentDate.trim()}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveGateway(paymentMode?: string): string {
  const token =
    typeof paymentMode === "string" && paymentMode.trim()
      ? paymentMode.trim().toUpperCase()
      : "CASH";
  return token.startsWith("OFFLINE_")
    ? canonicalizeGatewayForStorage(token)
    : canonicalizeGatewayForStorage(`OFFLINE_${token}`);
}

/**
 * Fast path: client already computed head-wise amounts (Fees Sheet modal).
 * Reads run outside the tx; only payment + allocations + fee update inside.
 */
export async function recordFastOfflineFeePayment(input: FastOfflinePaymentInput) {
  const {
    schoolId,
    studentId,
    amount,
    paymentMode,
    refNo,
    transactionId,
    paymentDate,
    selectedHeads,
    explicitAllocations,
    collectedByUserId,
    collectedByName,
  } = input;

  const selectedByKey = new Map<string, OfflineSelectedHead>();
  for (const h of selectedHeads) {
    selectedByKey.set(headKeyFromSelected(h), h);
  }

  let explicitTotal = 0;
  const normalizedAllocations = explicitAllocations.map((a) => ({
    key: normalizeAllocationKey(a.key),
    amount: a.amount,
    label: typeof a.label === "string" ? a.label.trim() : "",
  }));

  for (const a of normalizedAllocations) {
    if (!selectedByKey.has(a.key)) {
      throw new Error(`Head ${a.key} must be present in selectedHeads`);
    }
    explicitTotal += a.amount;
  }

  if (Math.abs(explicitTotal - amount) > 0.01) {
    throw new Error(
      `Sum of head-wise amounts (₹${explicitTotal.toFixed(2)}) must equal payment amount (₹${amount.toFixed(2)})`
    );
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      schoolId: true,
      fee: {
        select: {
          amountPaid: true,
          remainingFee: true,
          finalFee: true,
          totalFee: true,
        },
      },
    },
  });

  if (!student || student.schoolId !== schoolId || !student.fee) {
    throw new Error("Student or fee record not found");
  }

  const fee = student.fee;

  const breakdown = await computeAdminStudentFeeBreakdown(schoolId, studentId, {
    migrateLumps: true,
    cleanupHostelMessDuplicates: false,
    reconcileTotals: true,
  });
  const dueByKey = new Map<string, number>();
  for (const head of breakdown.dueHeads) {
    dueByKey.set(normalizeAllocationKey(head.key), (dueByKey.get(normalizeAllocationKey(head.key)) ?? 0) + head.dueBefore);
  }
  const totalHeadDue = Array.from(dueByKey.values()).reduce((sum, due) => sum + due, 0);

  if (amount > totalHeadDue + 0.01) {
    throw new Error(
      `Amount cannot exceed remaining due (₹${totalHeadDue.toLocaleString("en-IN")})`
    );
  }

  for (const a of normalizedAllocations) {
    const due = dueByKey.get(a.key);
    if (due === undefined) {
      throw new Error(`Invalid fee head key: ${a.key}`);
    }
    if (a.amount > due + 0.01) {
      throw new Error(`Amount for ${a.key} exceeds due (₹${due.toLocaleString("en-IN")})`);
    }
  }

  const extraIdsNeedingNames = [
    ...new Set(
      normalizedAllocations
        .filter((a) => a.key.startsWith("EXTRA:") && !a.label)
        .map((a) => a.key.slice("EXTRA:".length))
    ),
  ];

  const extraNameById = new Map<string, string>();
  if (extraIdsNeedingNames.length > 0) {
    const extras = await prisma.extraFee.findMany({
      where: { id: { in: extraIdsNeedingNames }, schoolId },
      select: { id: true, name: true },
    });
    for (const ef of extras) extraNameById.set(ef.id, ef.name);
  }

  const paymentAllocationsData = normalizedAllocations.map((a) => {
    const head = selectedByKey.get(a.key)!;
    if (head.headType === "BASE_COMPONENT") {
      return {
        studentId,
        allocationType: "PAYMENT" as const,
        allocatedAmount: a.amount,
        headType: "BASE_COMPONENT" as const,
        componentIndex: head.componentIndex,
        componentName: head.componentName?.trim() || a.label || `Component-${head.componentIndex + 1}`,
        extraFeeId: null as null,
        lineName: a.label || head.componentName?.trim() || `Component-${head.componentIndex + 1}`,
      };
    }
    const extraFeeId = head.extraFeeId;
    const lineName = a.label || extraNameById.get(extraFeeId) || "Extra Fee";
    return {
      studentId,
      allocationType: "PAYMENT" as const,
      allocatedAmount: a.amount,
      headType: "EXTRA_FEE" as const,
      componentIndex: null as null,
      componentName: lineName,
      extraFeeId,
      lineName,
    };
  });

  const newAmountPaid = roundRupee(fee.amountPaid + amount);

  const offlineGateway = resolveGateway(paymentMode);
  const txId = resolveOfflinePaymentTransactionId(transactionId, refNo);
  const selectedPaymentDate = parsePaymentDate(paymentDate);
  if (paymentDate?.trim() && !selectedPaymentDate) {
    throw new Error("Invalid paymentDate");
  }

  const result = await prisma.$transaction(
    async (tx) => {
      if (txId) {
        const existing = await findExistingOfflinePaymentByRef(tx, studentId, txId);
        if (existing) {
          const existingRows = await tx.paymentFeeAllocation.findMany({
            where: { paymentId: existing.id, allocationType: "PAYMENT" },
            select: {
              componentName: true,
              allocatedAmount: true,
              headType: true,
              extraFeeId: true,
              componentIndex: true,
            },
          });

          const plan = planSameRefPayment(
            existingRows as ExistingPaymentAllocation[],
            normalizedAllocations
          );

          if (plan.kind === "duplicate") {
            const extraIds = existingRows
              .filter((a) => a.headType === "EXTRA_FEE" && a.extraFeeId)
              .map((a) => a.extraFeeId as string);
            const extraNameByIdDup = new Map<string, string>();
            if (extraIds.length > 0) {
              const extras = await tx.extraFee.findMany({
                where: { id: { in: extraIds }, schoolId },
                select: { id: true, name: true },
              });
              for (const ef of extras) extraNameByIdDup.set(ef.id, ef.name);
            }
            return {
              payment: existing,
              idempotent: true as const,
              feeAllocations: existingRows.map((a) => ({
                name:
                  a.headType === "EXTRA_FEE"
                    ? extraNameByIdDup.get(a.extraFeeId as string) ?? "Extra Fee"
                    : String(a.componentName ?? "Fee"),
                amount: a.allocatedAmount,
                key: allocationKeyFromRecord(a as ExistingPaymentAllocation) ?? undefined,
              })),
            };
          }

          const deltaByKey = new Map(plan.deltas.map((d) => [d.key, d.amount]));
          const appendRows = normalizedAllocations
            .map((a, index) => ({ a, data: paymentAllocationsData[index]! }))
            .filter(({ a }) => deltaByKey.has(a.key));

          if (appendRows.length === 0) {
            throw new Error("Could not append allocations for this reference");
          }

          await tx.paymentFeeAllocation.createMany({
            data: appendRows.map(({ a, data }) => ({
              paymentId: existing.id,
              studentId: data.studentId,
              allocationType: data.allocationType,
              allocatedAmount: deltaByKey.get(a.key)!,
              headType: data.headType,
              componentIndex: data.componentIndex,
              componentName: data.componentName,
              extraFeeId: data.extraFeeId,
            })),
          });

          const updatedPayment = await tx.payment.update({
            where: { id: existing.id },
            data: { amount: roundRupee(existing.amount + plan.appendTotal) },
          });

          const appendedAmountPaid = roundRupee(fee.amountPaid + plan.appendTotal);
          const feeUpdate = await tx.studentFee.updateMany({
            where: { studentId },
            data: {
              amountPaid: appendedAmountPaid,
              remainingFee: Math.max(0, roundRupee(fee.finalFee - appendedAmountPaid)),
            },
          });
          if (feeUpdate.count !== 1) {
            throw new Error("Fee record was updated concurrently");
          }

          return {
            payment: updatedPayment,
            idempotent: false as const,
            appendedToExistingRef: true as const,
            appendedAmount: plan.appendTotal,
            feeAllocations: appendRows.map(({ a, data }) => ({
              name: data.lineName,
              amount: deltaByKey.get(a.key)!,
              key: a.key,
            })),
          };
        }
      }

      const payment = await tx.payment.create({
        data: {
          studentId,
          amount,
          gateway: offlineGateway,
          status: "SUCCESS",
          transactionId: txId,
          ...(collectedByUserId ? { collectedByUserId } : {}),
          ...(collectedByName ? { collectedByName } : {}),
          ...(selectedPaymentDate ? { createdAt: selectedPaymentDate } : {}),
        },
      });

      if (paymentAllocationsData.length > 0) {
        await tx.paymentFeeAllocation.createMany({
          data: paymentAllocationsData.map((d) => ({
            paymentId: payment.id,
            studentId: d.studentId,
            allocationType: d.allocationType,
            allocatedAmount: d.allocatedAmount,
            headType: d.headType,
            componentIndex: d.componentIndex,
            componentName: d.componentName,
            extraFeeId: d.extraFeeId,
          })),
        });
      }

      const feeUpdate = await tx.studentFee.updateMany({
        where: { studentId },
        data: {
          amountPaid: newAmountPaid,
          remainingFee: Math.max(0, roundRupee(fee.finalFee - newAmountPaid)),
        },
      });

      if (feeUpdate.count !== 1) {
        throw new Error("Fee record was updated concurrently");
      }

      return { payment, idempotent: false as const, feeAllocations: null as null };
    },
    FEE_MUTATION_TX
  );

  const appliedAmount = result.idempotent
    ? 0
    : "appendedAmount" in result && typeof result.appendedAmount === "number"
      ? result.appendedAmount
      : amount;

  let reconciledFee = {
    amountPaid: result.idempotent ? fee.amountPaid : roundRupee(fee.amountPaid + appliedAmount),
    remainingFee: result.idempotent
      ? fee.remainingFee
      : Math.max(0, roundRupee(fee.finalFee - roundRupee(fee.amountPaid + appliedAmount))),
    finalFee: fee.finalFee,
    totalFee: fee.totalFee,
  };

  if (!result.idempotent) {
    const integrity = await reconcileStudentFeeIntegrity(schoolId, studentId, {
      repairAllocations: true,
      apply: true,
    });
    if (integrity) {
      reconciledFee = {
        amountPaid: integrity.after.amountPaid,
        remainingFee: integrity.after.remainingFee,
        finalFee: integrity.after.finalFee,
        totalFee: integrity.after.totalFee,
      };
    } else {
      invalidateStudentFeeReadCaches({ studentId, schoolId });
    }
  }

  const allocationLines =
    result.feeAllocations ??
    paymentAllocationsData.map((d, index) => ({
      name: d.lineName,
      amount: d.allocatedAmount,
      key: normalizedAllocations[index]?.key,
    }));

  return {
    payment: result.payment,
    updatedFee: reconciledFee,
    feeAllocations: allocationLines,
    idempotent: result.idempotent,
    appendedToExistingRef:
      "appendedToExistingRef" in result ? Boolean(result.appendedToExistingRef) : false,
  };
}

export function canUseFastOfflineFeePayment(
  selectedHeads: OfflineSelectedHead[],
  explicitAllocations: OfflineExplicitAllocation[]
): boolean {
  return selectedHeads.length > 0 && explicitAllocations.length > 0;
}
