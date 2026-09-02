import prisma from "@/lib/db";
import { computeAdminStudentFeeBreakdown } from "@/lib/computeAdminStudentFeeBreakdown";
import { roundRupee } from "@/lib/formatRupee";
import { repairOrphanExtraFeeAllocations } from "@/lib/repairOrphanExtraFeeAllocations";
import { sumSuccessfulFeePayments } from "@/lib/reconcileStudentFeeFromPayments";
import { invalidateStudentFeeReadCaches } from "@/lib/studentFeeReadCache";

export type StudentFeeIntegritySnapshot = {
  studentId: string;
  before: {
    totalFee: number;
    finalFee: number;
    amountPaid: number;
    remainingFee: number;
    discountPercent: number;
  };
  after: {
    totalFee: number;
    finalFee: number;
    amountPaid: number;
    remainingFee: number;
    discountAmount: number;
  };
  changed: boolean;
  allocationRepair?: { reassigned: number; namesBackfilled: number };
};

function fieldsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.01;
}

/**
 * Realign one student's fee totals from payments (source of truth for paid) and
 * fee-head breakdown (source of truth for gross/final/discount). Never deletes
 * payments or allocations — only repairs orphan allocation links when needed.
 */
export async function reconcileStudentFeeIntegrity(
  schoolId: string,
  studentId: string,
  options?: { repairAllocations?: boolean; apply?: boolean; skipBreakdown?: boolean }
): Promise<StudentFeeIntegritySnapshot | null> {
  const apply = options?.apply !== false;
  const repairAllocations = options?.repairAllocations !== false;

  const fee = await prisma.studentFee.findUnique({
    where: { studentId },
    select: {
      totalFee: true,
      finalFee: true,
      amountPaid: true,
      remainingFee: true,
      discountPercent: true,
      discountFeeHeadKey: true,
      discountRemarks: true,
    },
  });
  if (!fee) return null;

  let allocationRepair: { reassigned: number; namesBackfilled: number } | undefined;
  if (repairAllocations) {
    allocationRepair = await repairOrphanExtraFeeAllocations(prisma, schoolId, { studentId });
  }

  const paymentSum = await sumSuccessfulFeePayments(studentId);
  const amountPaid = roundRupee(paymentSum);

  const hasChairmanDiscount =
    Boolean(fee.discountFeeHeadKey?.trim()) || Boolean(fee.discountRemarks?.trim());
  const hasDiscount =
    fee.discountPercent > 0 || Math.abs(fee.totalFee - fee.finalFee) > 0.01;
  const needsBreakdown =
    !options?.skipBreakdown &&
    !hasChairmanDiscount &&
    (hasDiscount || fee.finalFee !== roundRupee(fee.finalFee));

  let grossTotal = roundRupee(fee.totalFee);
  let finalFee = roundRupee(fee.finalFee);

  if (needsBreakdown) {
    const breakdown = await computeAdminStudentFeeBreakdown(schoolId, studentId, {
      migrateLumps: false,
      cleanupHostelMessDuplicates: false,
      reconcileTotals: false,
    });
    grossTotal = roundRupee(
      breakdown.dueHeads.reduce((s, h) => s + (h.grossAmount ?? h.snapshotAmount), 0)
    );
    finalFee = roundRupee(breakdown.finalFee);
  }

  const remainingFee = Math.max(0, roundRupee(finalFee - amountPaid));
  const discountAmount = Math.max(0, roundRupee(grossTotal - finalFee));

  const after = {
    totalFee: grossTotal,
    finalFee,
    amountPaid,
    remainingFee,
    discountAmount,
  };

  const before = {
    totalFee: fee.totalFee,
    finalFee: fee.finalFee,
    amountPaid: fee.amountPaid,
    remainingFee: fee.remainingFee,
    discountPercent: fee.discountPercent,
  };

  const changed =
    fieldsDiffer(before.totalFee, after.totalFee) ||
    fieldsDiffer(before.finalFee, after.finalFee) ||
    fieldsDiffer(before.amountPaid, after.amountPaid) ||
    fieldsDiffer(before.remainingFee, after.remainingFee);

  if (changed && apply) {
    await prisma.studentFee.update({
      where: { studentId },
      data: {
        totalFee: after.totalFee,
        finalFee: after.finalFee,
        amountPaid: after.amountPaid,
        remainingFee: after.remainingFee,
      },
    });
    invalidateStudentFeeReadCaches({ studentId, schoolId });
  }

  return { studentId, before, after, changed, allocationRepair };
}

export type SchoolFeeReconcileReport = {
  schoolId: string;
  dryRun: boolean;
  studentsProcessed: number;
  studentsChanged: number;
  allocationReassigned: number;
  allocationNamesBackfilled: number;
  samples: StudentFeeIntegritySnapshot[];
};

/** Reconcile all students in a school. Use dryRun=true to preview without writing. */
export async function reconcileSchoolFeeIntegrity(
  schoolId: string,
  options?: { dryRun?: boolean; limit?: number }
): Promise<SchoolFeeReconcileReport> {
  const dryRun = options?.dryRun === true;
  const students = await prisma.student.findMany({
    where: { schoolId },
    select: { id: true },
    ...(options?.limit ? { take: options.limit } : {}),
  });

  const schoolAllocationRepair = await repairOrphanExtraFeeAllocations(prisma, schoolId);

  const report: SchoolFeeReconcileReport = {
    schoolId,
    dryRun,
    studentsProcessed: 0,
    studentsChanged: 0,
    allocationReassigned: schoolAllocationRepair.reassigned,
    allocationNamesBackfilled: schoolAllocationRepair.namesBackfilled,
    samples: [],
  };

  for (const { id: studentId } of students) {
    const result = await reconcileStudentFeeIntegrity(schoolId, studentId, {
      apply: !dryRun,
      repairAllocations: false,
    });
    if (!result) continue;
    report.studentsProcessed += 1;
    if (result.changed) {
      report.studentsChanged += 1;
      if (report.samples.length < 20) report.samples.push(result);
    }
  }

  return report;
}
