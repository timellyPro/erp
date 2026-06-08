import prisma from "@/lib/db";

const SUCCESS_STATUSES = ["SUCCESS", "COMPLETED"] as const;

/** Sum successful school-fee payments for a student (source of truth for amountPaid). */
export async function sumSuccessfulFeePayments(studentId: string): Promise<number> {
  const agg = await prisma.payment.aggregate({
    where: {
      studentId,
      eventRegistrationId: null,
      purpose: "FEES",
      status: { in: [...SUCCESS_STATUSES] },
    },
    _sum: { amount: true },
  });
  return Math.round((agg._sum.amount ?? 0) * 100) / 100;
}

/** Realign StudentFee.amountPaid / remainingFee from Payment rows after delete or drift. */
export async function reconcileStudentFeeTotalsFromPayments(studentId: string) {
  const fee = await prisma.studentFee.findUnique({
    where: { studentId },
    select: { finalFee: true },
  });
  if (!fee) return null;

  const amountPaid = await sumSuccessfulFeePayments(studentId);
  const remainingFee = Math.max(Math.round((fee.finalFee - amountPaid) * 100) / 100, 0);

  return prisma.studentFee.update({
    where: { studentId },
    data: { amountPaid, remainingFee },
    select: { amountPaid: true, remainingFee: true, finalFee: true },
  });
}
