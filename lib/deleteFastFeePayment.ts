import prisma from "@/lib/db";
import { FEE_MUTATION_TX } from "@/lib/prismaFeeMutationTx";
import { reconcileStudentFeeTotalsFromPayments } from "@/lib/reconcileStudentFeeFromPayments";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";

function isSuccessPaymentStatus(status: string): boolean {
  const u = status.toUpperCase();
  return u === "SUCCESS" || u === "COMPLETED";
}

function isFeePayment(p: { purpose: string; eventRegistrationId: string | null }) {
  return !p.eventRegistrationId && (p.purpose === "FEES" || !p.purpose);
}

export type DeleteFeePaymentResult = {
  paymentId: string;
  studentId: string;
  updatedFee: {
    amountPaid: number;
    remainingFee: number;
    finalFee: number;
  } | null;
};

/**
 * Fast fee-payment delete: remove payment (cascades allocations), then realign StudentFee from remaining payments.
 */
export async function deleteFastFeePayment(
  paymentId: string,
  schoolId: string,
  expectedStudentId?: string
): Promise<DeleteFeePaymentResult> {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      ...(expectedStudentId ? { studentId: expectedStudentId } : {}),
    },
    select: {
      id: true,
      studentId: true,
      amount: true,
      status: true,
      purpose: true,
      eventRegistrationId: true,
      student: { select: { schoolId: true } },
    },
  });

  if (!payment || payment.student.schoolId !== schoolId) {
    throw new Error("Payment not found");
  }

  if (!isFeePayment(payment)) {
    throw new Error("Only school fee payments can be deleted here");
  }

  const [subCount, refundHit] = await Promise.all([
    prisma.parentSubscription.count({ where: { paymentId: payment.id } }),
    prisma.refund.findFirst({
      where: { paymentId: payment.id, status: "SUCCESS" },
      select: { id: true },
    }),
  ]);

  if (subCount > 0) {
    throw new Error("This payment is linked to a subscription and cannot be deleted");
  }
  if (refundHit) {
    throw new Error("Delete blocked: this payment has refund records. Use the refund flow instead.");
  }

  const shouldReconcile = isSuccessPaymentStatus(String(payment.status || ""));

  await prisma.$transaction(
    async (tx) => {
      await tx.payment.delete({ where: { id: payment.id } });
    },
    FEE_MUTATION_TX
  );

  let updatedFee: DeleteFeePaymentResult["updatedFee"] = null;
  if (shouldReconcile) {
    updatedFee = await reconcileStudentFeeTotalsFromPayments(payment.studentId);
  }

  invalidateStudentFeeReadCaches({ studentId: payment.studentId, schoolId });

  return {
    paymentId: payment.id,
    studentId: payment.studentId,
    updatedFee,
  };
}
