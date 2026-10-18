import { tenantDb as prisma } from "@/lib/db/tenantContext";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/fees/feePaymentStatuses";
import { buildStudentFeeRecalcPayload, buildTuitionBulkCache } from "@/lib/fees/studentTuitionFromStructure";
import { activeStudentWhere } from "@/lib/students/studentStatus";

/**
 * Read-only check of EVERY active student's stored fee (StudentFee) against the sources of truth:
 *
 *  - gross total: class fee structure + the extra fees that apply to the student (the same function
 *    that writes the stored total, so a mismatch means the stored number is stale or was never updated,
 *    for example a fee head that was added without reaching the stored total);
 *  - amount paid: the sum of the student's successful fee payments;
 *  - remaining: stored final fee minus stored amount paid.
 *
 * reconcileStudentFeeIntegrity only recomputes the total for students with a discount or a long
 * decimal, so a student whose stored total is a clean but wrong number was never detected. This
 * checks all of them, in a few queries per school (no per-student round trips).
 *
 * It does NOT recompute per-head discounts, so it never judges `finalFee` against the breakdown;
 * that stays the job of reconcileStudentFeeIntegrity.
 */
export type FeeDriftKind = "grossTotal" | "amountPaid" | "remaining";

export type FeeDriftSample = {
  studentId: string;
  kind: FeeDriftKind;
  stored: number;
  expected: number;
  difference: number;
};

export type FeeDriftReport = {
  schoolId: string;
  studentsChecked: number;
  studentsDrifted: number;
  byKind: Record<FeeDriftKind, number>;
  samples: FeeDriftSample[];
};

/** Whole rupees: stored totals are rounded to the rupee, so anything under this is rounding. */
export const FEE_DRIFT_TOLERANCE = 1.01;
const MAX_SAMPLES = 50;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function detectFeeTotalsDrift(schoolId: string): Promise<FeeDriftReport> {
  const fees = await prisma.studentFee.findMany({
    where: { student: { schoolId, ...activeStudentWhere } },
    select: {
      studentId: true,
      totalFee: true,
      finalFee: true,
      amountPaid: true,
      remainingFee: true,
      discountPercent: true,
      student: { select: { classId: true, residencyType: true, class: { select: { section: true } } } },
    },
  });

  const classIds = [...new Set(fees.map((f) => f.student.classId).filter((id): id is string => Boolean(id)))];
  const cache = await buildTuitionBulkCache(prisma, schoolId, classIds);

  const paidRows = await prisma.payment.groupBy({
    by: ["studentId"],
    where: {
      student: { schoolId },
      purpose: "FEES",
      eventRegistrationId: null,
      status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] },
    },
    _sum: { amount: true },
  });
  const paidByStudent = new Map(paidRows.map((r) => [r.studentId, r._sum.amount ?? 0]));

  const byKind: Record<FeeDriftKind, number> = { grossTotal: 0, amountPaid: 0, remaining: 0 };
  const samples: FeeDriftSample[] = [];
  const driftedStudents = new Set<string>();

  const note = (studentId: string, kind: FeeDriftKind, stored: number, expected: number) => {
    byKind[kind] += 1;
    driftedStudents.add(studentId);
    if (samples.length < MAX_SAMPLES) {
      samples.push({ studentId, kind, stored, expected, difference: round2(expected - stored) });
    }
  };

  for (const fee of fees) {
    const expected = buildStudentFeeRecalcPayload(
      {
        id: fee.studentId,
        classId: fee.student.classId,
        section: fee.student.class?.section ?? null,
        residencyType: fee.student.residencyType,
        discountPercent: fee.discountPercent,
        amountPaid: fee.amountPaid,
      },
      cache
    );
    if (Math.abs(fee.totalFee - expected.totalFee) > FEE_DRIFT_TOLERANCE) {
      note(fee.studentId, "grossTotal", fee.totalFee, expected.totalFee);
    }

    const paid = round2(paidByStudent.get(fee.studentId) ?? 0);
    if (Math.abs(fee.amountPaid - paid) > FEE_DRIFT_TOLERANCE) {
      note(fee.studentId, "amountPaid", fee.amountPaid, paid);
    }

    const expectedRemaining = Math.max(0, round2(fee.finalFee - fee.amountPaid));
    if (Math.abs(fee.remainingFee - expectedRemaining) > FEE_DRIFT_TOLERANCE) {
      note(fee.studentId, "remaining", fee.remainingFee, expectedRemaining);
    }
  }

  return {
    schoolId,
    studentsChecked: fees.length,
    studentsDrifted: driftedStudents.size,
    byKind,
    samples,
  };
}
