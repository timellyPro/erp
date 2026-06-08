import prisma from "@/lib/db";
import { canonicalizeGatewayForStorage } from "@/lib/feePaymentGateway";
import { FEE_MUTATION_TX } from "@/lib/prismaFeeMutationTx";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";

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

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true,
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

  if (!student?.fee) {
    throw new Error("Student or fee record not found");
  }

  const fee = student.fee;

  if (amount > fee.remainingFee + 0.01) {
    throw new Error(
      `Amount cannot exceed remaining due (₹${fee.remainingFee.toLocaleString("en-IN")})`
    );
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
      componentName: null as null,
      extraFeeId,
      lineName,
    };
  });

  const newAmountPaid = Math.round((fee.amountPaid + amount) * 100) / 100;
  const newRemaining = Math.max(Math.round((fee.remainingFee - amount) * 100) / 100, 0);

  const offlineGateway = resolveGateway(paymentMode);
  const normalizedRef = typeof refNo === "string" ? refNo.trim() : "";
  const normalizedTxn = typeof transactionId === "string" ? transactionId.trim() : "";
  const txId = normalizedTxn || normalizedRef || null;
  const selectedPaymentDate = parsePaymentDate(paymentDate);
  if (paymentDate?.trim() && !selectedPaymentDate) {
    throw new Error("Invalid paymentDate");
  }

    const result = await prisma.$transaction(
    async (tx) => {
      const payment = await tx.payment.create({
        data: {
          studentId,
          amount,
          gateway: offlineGateway,
          status: "SUCCESS",
          transactionId: txId,
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
        where: { studentId, remainingFee: { gte: amount - 0.01 } },
        data: {
          amountPaid: { increment: amount },
          remainingFee: { decrement: amount },
        },
      });

      if (feeUpdate.count !== 1) {
        throw new Error("Amount exceeds remaining due or fee was updated concurrently");
      }

      return { payment };
    },
    FEE_MUTATION_TX
  );

  invalidateStudentFeeReadCaches({ studentId, schoolId });

  return {
    payment: result.payment,
    updatedFee: {
      amountPaid: newAmountPaid,
      remainingFee: newRemaining,
      finalFee: fee.finalFee,
      totalFee: fee.totalFee,
    },
    feeAllocations: paymentAllocationsData.map((d, index) => ({
      name: d.lineName,
      amount: d.allocatedAmount,
      key: normalizedAllocations[index]?.key,
    })),
  };
}

export function canUseFastOfflineFeePayment(
  selectedHeads: OfflineSelectedHead[],
  explicitAllocations: OfflineExplicitAllocation[]
): boolean {
  return selectedHeads.length > 0 && explicitAllocations.length > 0;
}
