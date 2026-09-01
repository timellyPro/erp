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
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { schoolId: true },
  });
  if (!student) return null;

  const { reconcileStudentFeeIntegrity } = await import("@/lib/reconcileStudentFeeIntegrity");
  const result = await reconcileStudentFeeIntegrity(student.schoolId, studentId, {
    repairAllocations: true,
    apply: true,
  });
  if (!result) return null;

  return prisma.studentFee.findUnique({
    where: { studentId },
    select: { amountPaid: true, remainingFee: true, finalFee: true, totalFee: true },
  });
}
