import prisma from "@/lib/db";
import { FEE_MUTATION_TX } from "@/lib/prismaFeeMutationTx";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";

export type PaymentAllocationSplit = {
  headType: "BASE_COMPONENT" | "EXTRA_FEE";
  componentIndex?: number | null;
  componentName: string;
  extraFeeId?: string | null;
  allocatedAmount: number;
};

type SplitDb = Pick<typeof prisma, "$transaction" | "paymentFeeAllocation" | "payment">;

/**
 * Replace one payment's PAYMENT allocations with an explicit multi-head split.
 * Used to repair mis-posted single-head payments (e.g. last year vs mess + transport).
 */
export async function splitPaymentAllocations(
  db: SplitDb,
  paymentId: string,
  splits: PaymentAllocationSplit[],
  options?: { schoolId?: string; studentId?: string }
): Promise<{ replaced: number }> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, studentId: true, amount: true, student: { select: { schoolId: true } } },
  });
  if (!payment) throw new Error("Payment not found");

  const splitTotal = splits.reduce((s, x) => s + (Number(x.allocatedAmount) || 0), 0);
  if (Math.abs(splitTotal - payment.amount) > 0.02) {
    throw new Error(
      `Split total (₹${splitTotal.toFixed(2)}) must equal payment amount (₹${payment.amount.toFixed(2)})`
    );
  }

  const studentId = options?.studentId ?? payment.studentId;
  const schoolId = options?.schoolId ?? payment.student.schoolId;

  const replaced = await db.$transaction(async (tx) => {
    await tx.paymentFeeAllocation.deleteMany({
      where: { paymentId, allocationType: "PAYMENT" },
    });
    if (splits.length === 0) return 0;
    await tx.paymentFeeAllocation.createMany({
      data: splits.map((s) => ({
        paymentId,
        studentId,
        allocationType: "PAYMENT" as const,
        allocatedAmount: s.allocatedAmount,
        headType: s.headType,
        componentIndex: s.headType === "BASE_COMPONENT" ? (s.componentIndex ?? null) : null,
        componentName: s.componentName.trim(),
        extraFeeId: s.headType === "EXTRA_FEE" ? (s.extraFeeId ?? null) : null,
      })),
    });
    return splits.length;
  }, FEE_MUTATION_TX);

  invalidateStudentFeeReadCaches({ studentId, schoolId });
  return { replaced };
}
