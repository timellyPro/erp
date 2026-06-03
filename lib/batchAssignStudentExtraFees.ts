import prisma from "@/lib/db";
import {
  extraFeeAppliesToStudent,
  parseExtraFeeResidencyScopeBody,
  suggestedResidencyScopeForExtraFeeName,
} from "@/lib/extraFeeResidencyScope";
import { createExtraFeeRows, type ExtraFeeCreatePayload } from "@/lib/extraFeeInstallmentDb";

export type BatchAssignFeeInput = {
  name: string;
  amount: number;
  residencyScope?: string | null;
  splitIntoTwoInstallments?: boolean;
};

export async function batchAssignStudentExtraFees(
  schoolId: string,
  studentId: string,
  fees: BatchAssignFeeInput[]
): Promise<{ createdCount: number; totalAmount: number; extraFeeIds: string[] }> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, residencyType: true },
  });
  if (!student) {
    throw new Error("Student not found");
  }

  const cleaned = fees
    .map((f) => {
      const name = String(f.name ?? "").trim();
      const amount = Number(f.amount);
      if (!name || !Number.isFinite(amount) || amount <= 0) return null;

      let residencyScope = parseExtraFeeResidencyScopeBody(f.residencyScope) ?? "ALL";
      const suggested = suggestedResidencyScopeForExtraFeeName(name);
      if (residencyScope === "ALL" && suggested !== "ALL") {
        residencyScope = suggested;
      }

      if (!extraFeeAppliesToStudent({ name, residencyScope }, student.residencyType)) {
        return null;
      }

      return {
        name,
        amount,
        residencyScope,
        splitIntoTwoInstallments: Boolean(f.splitIntoTwoInstallments),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  if (cleaned.length === 0) {
    throw new Error("No valid fees to assign");
  }

  const extraFeeIds: string[] = [];
  let totalAmount = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of cleaned) {
      const payload: ExtraFeeCreatePayload = {
        schoolId,
        name: row.name,
        amount: row.amount,
        targetType: "STUDENT",
        targetClassId: null,
        targetSection: null,
        targetStudentId: studentId,
        residencyScope: row.residencyScope,
        splitIntoTwoInstallments: row.splitIntoTwoInstallments,
      };
      const created = await createExtraFeeRows(tx, payload);
      extraFeeIds.push(...created.ids);
      totalAmount += created.totalAmount;
    }

    if (totalAmount > 0) {
      await tx.studentFee.updateMany({
        where: { studentId },
        data: {
          totalFee: { increment: totalAmount },
          finalFee: { increment: totalAmount },
          remainingFee: { increment: totalAmount },
        },
      });
    }
  });

  return { createdCount: extraFeeIds.length, totalAmount, extraFeeIds };
}
