import type { ConversionTx } from "@/lib/students/applyStudentResidencyConversion";
import { roundRupee } from "@/lib/formatRupee";
import { computeStudentTuitionParts, type TuitionDb } from "@/lib/fees/studentTuitionFromStructure";

export type ApprovedDiscountRow = {
  discountPercent: number;
  discountFixedAmount: number | null;
  discountFeeHeadKey: string | null;
  discountFeeHeadLabel: string | null;
  discountRemarks: string | null;
};

export type DiscountedFee = {
  totalFee: number;
  finalFee: number;
  discountPercent: number;
  totalDiscount: number;
};

/**
 * Fee after the approved discounts. `base` is the class fee structure and `extrasTotal` the extra fees,
 * both rebuilt from the structure, never read back from the stored row. A percent concession is taken off
 * the structure only (extras stay at full price, as everywhere else); a fixed rupee concession comes off
 * as given. The discount can never exceed the gross total.
 */
export function applyApprovedDiscounts(
  parts: { base: number; extrasTotal: number },
  approved: ApprovedDiscountRow[]
): DiscountedFee {
  const totalFee = roundRupee(parts.base + parts.extrasTotal);
  const raw = approved.reduce((sum, row) => {
    const fixed = Number(row.discountFixedAmount || 0);
    if (fixed > 0) return sum + fixed;
    return sum + parts.base * (Math.min(100, Math.max(0, Number(row.discountPercent || 0))) / 100);
  }, 0);
  const totalDiscount = Math.min(totalFee, roundRupee(raw));
  const finalFee = Math.max(0, roundRupee(totalFee - totalDiscount));
  const discountPercent = parts.base > 0 ? Math.min(100, (totalDiscount / parts.base) * 100) : 0;
  return { totalFee, finalFee, discountPercent, totalDiscount };
}

type RawTx = ConversionTx;

/**
 * Recomputes one student's stored fee after a concession is approved or reverted. Runs inside the
 * caller's transaction and locks the StudentFee row first, so a payment or recalculation that lands at
 * the same moment cannot be overwritten with an old copy. `totalFee` is rebuilt from the fee structure
 * plus extras; `amountPaid` is read from the locked row and never written.
 */
export async function recalculateFeeAfterDiscountApproval(
  tx: RawTx,
  args: { schoolId: string; studentId: string; studentFeeId: string }
): Promise<DiscountedFee | null> {
  const [locked] = await tx.$queryRaw<Array<{ totalFee: number; amountPaid: number }>>`
    SELECT sf."totalFee", sf."amountPaid"
    FROM "StudentFee" sf
    JOIN "Student" s ON s.id = sf."studentId"
    WHERE sf.id = ${args.studentFeeId} AND s."schoolId" = ${args.schoolId}
    FOR UPDATE OF sf
  `;
  if (!locked) return null;

  const student = (await tx.student.findFirst({
    where: { id: args.studentId, schoolId: args.schoolId },
    select: { classId: true, residencyType: true, class: { select: { section: true } } },
  })) as { classId: string | null; residencyType: string | null; class: { section: string | null } | null } | null;

  let parts = student
    ? await computeStudentTuitionParts(tx as unknown as TuitionDb, {
        schoolId: args.schoolId,
        classId: student.classId,
        section: student.class?.section ?? null,
        studentId: args.studentId,
        residencyType: student.residencyType ?? "Day Scholar",
      })
    : { base: 0, extrasTotal: 0, totalFee: 0 };
  // No structure to rebuild from (class not set up yet): keep the stored total rather than zero it.
  if (parts.totalFee <= 0 && Number(locked.totalFee) > 0) {
    parts = { base: Number(locked.totalFee), extrasTotal: 0, totalFee: Number(locked.totalFee) };
  }

  const approved = await tx.$queryRaw<ApprovedDiscountRow[]>`
    SELECT "discountPercent", "discountFixedAmount", "discountFeeHeadKey", "discountFeeHeadLabel", "discountRemarks"
    FROM "FeeDiscountApproval"
    WHERE "studentId" = ${args.studentId} AND "schoolId" = ${args.schoolId}
      AND status::text = 'APPROVED'
    ORDER BY COALESCE("reviewedAt", "createdAt") DESC
  `;

  const result = applyApprovedDiscounts(parts, approved);
  const remainingFee = Math.max(0, roundRupee(result.finalFee - Number(locked.amountPaid || 0)));
  const latest = approved[0] ?? null;

  await tx.$executeRaw`
    UPDATE "StudentFee"
    SET "totalFee" = ${result.totalFee},
        "discountPercent" = ${result.discountPercent},
        "finalFee" = ${result.finalFee},
        "remainingFee" = ${remainingFee},
        "discountFeeHeadKey" = ${latest?.discountFeeHeadKey ?? null},
        "discountFeeHeadLabel" = ${latest?.discountFeeHeadLabel ?? null},
        "discountRemarks" = ${latest?.discountRemarks ?? null},
        "updatedAt" = NOW()
    WHERE id = ${args.studentFeeId}
  `;
  return result;
}
