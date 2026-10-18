import { Prisma } from "@prisma/client";
import { tenantDb as prisma } from "@/lib/db/tenantContext";

const STUDENT_FEE_UPDATE_CHUNK = 200;

/**
 * Shift the stored fee of the given students by `delta` (negative to remove a fee).
 *
 * Runs on the request's tenant transaction, so it commits or rolls back together with the extra-fee
 * change that caused it. Totals are kept in whole rupees like every other writer
 * (upsertStudentFeeFromStructure, recalculateStoredFees), and `remainingFee` is derived from the new
 * final fee and what was paid rather than shifted by the delta. Shifting a value that had been clamped
 * at 0 would otherwise leave it off by the clamped amount for good.
 */
export async function applyStudentFeeDelta(studentIds: string[], delta: number) {
  if (studentIds.length === 0 || delta === 0) return;
  for (let i = 0; i < studentIds.length; i += STUDENT_FEE_UPDATE_CHUNK) {
    const ids = studentIds.slice(i, i + STUDENT_FEE_UPDATE_CHUNK);
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "StudentFee"
        SET
          "totalFee" = ROUND("totalFee" + ${delta}),
          "finalFee" = ROUND("finalFee" + ${delta}),
          "remainingFee" = GREATEST(0, ROUND("finalFee" + ${delta}) - "amountPaid")
        WHERE "studentId" IN (${Prisma.join(ids)})
      `
    );
  }
}
