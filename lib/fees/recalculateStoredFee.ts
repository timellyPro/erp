import { buildStudentFeeRecalcPayload, buildTuitionBulkCache } from "@/lib/fees/studentTuitionFromStructure";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";

/**
 * Rewrites the STORED fee (totalFee, finalFee, remainingFee) of chosen students from the class fee
 * structure and the extra fees that apply to them: the same calculation that writes it when a fee
 * changes. Meant for students that scripts/fee-integrity-report.ts flags with a wrong gross total.
 *
 * Why a separate tool: reconcileStudentFeeIntegrity only recomputes the total for students with a
 * discount or a long decimal, so it cannot repair a clean but wrong total.
 *
 * Safe by construction:
 *  - dry run unless `apply` is true; the plan is returned either way;
 *  - amountPaid is never touched (payments are the source of truth for it);
 *  - a student with a discount (percent, discount head, or remarks) is blocked, because per-head
 *    discount rules live in the profile breakdown, not here. Pass allowDiscount to override once a
 *    person has reviewed that student.
 */
export type StoredFee = {
  totalFee: number;
  finalFee: number;
  amountPaid: number;
  remainingFee: number;
};

export type StoredFeePlan = {
  studentId: string;
  found: boolean;
  before?: StoredFee;
  after?: StoredFee;
  changed: boolean;
  blockedReason?: string;
};

type FeeRow = {
  studentId: string;
  totalFee: number;
  finalFee: number;
  amountPaid: number;
  remainingFee: number;
  discountPercent: number;
  discountFeeHeadKey: string | null;
  discountRemarks: string | null;
  student: { classId: string | null; residencyType: string | null; class: { section: string | null } | null };
};

export type RecalcDb = {
  studentFee: {
    findMany: (args: unknown) => Promise<FeeRow[]>;
    update: (args: { where: { studentId: string }; data: Record<string, number | string | null> }) => Promise<unknown>;
  };
  extraFee: { findMany: (args: unknown) => Promise<unknown[]> };
  classFeeStructure: { findMany: (args: unknown) => Promise<unknown[]> };
  class: { findMany: (args: unknown) => Promise<unknown[]> };
};

/** Differences under this are rounding and are not worth a write. */
const EPS = 0.005;

export async function recalculateStoredFees(
  db: RecalcDb,
  input: {
    schoolId: string;
    studentIds: string[];
    apply: boolean;
    allowDiscount?: boolean;
    /**
     * Rupee concession the school has confirmed in writing. Used instead of the stored percent, which can
     * be stale when the stored total was wrong: final = rebuilt total - this amount. Counts as the review
     * that allowDiscount stands for. Only valid for a single student.
     */
    concessionRupee?: number;
    /**
     * Also record the concession on the fee record (which head it sits on, the percent and the note), for a
     * student whose record has none. Without a head the profile recalculates from the heads and drops the
     * rupee concession again. Only used together with concessionRupee.
     */
    concessionRecord?: { headKey: string; headLabel: string; remarks: string };
  }
): Promise<StoredFeePlan[]> {
  const wanted = [...new Set(input.studentIds.map((s) => s.trim()).filter(Boolean))];
  if (wanted.length === 0) throw new Error("Give at least one student id");
  const concession = input.concessionRupee;
  if (concession !== undefined) {
    if (!Number.isFinite(concession) || concession < 0) throw new Error("concessionRupee must be zero or more");
    if (wanted.length !== 1) throw new Error("concessionRupee applies to one student at a time");
  }
  if (input.concessionRecord && concession === undefined) throw new Error("concessionRecord needs concessionRupee");

  const rows = await db.studentFee.findMany({
    where: { studentId: { in: wanted }, student: { schoolId: input.schoolId } },
    select: {
      studentId: true,
      totalFee: true,
      finalFee: true,
      amountPaid: true,
      remainingFee: true,
      discountPercent: true,
      discountFeeHeadKey: true,
      discountRemarks: true,
      student: { select: { classId: true, residencyType: true, class: { select: { section: true } } } },
    },
  });
  const byId = new Map(rows.map((r) => [r.studentId, r]));

  const classIds = [...new Set(rows.map((r) => r.student.classId).filter((id): id is string => Boolean(id)))];
  const cache = await buildTuitionBulkCache(db as unknown as Parameters<typeof buildTuitionBulkCache>[0], input.schoolId, classIds);

  const plans: StoredFeePlan[] = [];
  for (const studentId of wanted) {
    const row = byId.get(studentId);
    if (!row) {
      plans.push({ studentId, found: false, changed: false, blockedReason: "No fee record for this student in this school" });
      continue;
    }
    const before: StoredFee = {
      totalFee: row.totalFee,
      finalFee: row.finalFee,
      amountPaid: row.amountPaid,
      remainingFee: row.remainingFee,
    };
    const payload = buildStudentFeeRecalcPayload(
      {
        id: studentId,
        classId: row.student.classId,
        section: row.student.class?.section ?? null,
        residencyType: row.student.residencyType,
        discountPercent: row.discountPercent,
        amountPaid: row.amountPaid, // never changed here
        existing: { totalFee: row.totalFee, finalFee: row.finalFee, discountFeeHeadKey: row.discountFeeHeadKey },
      },
      cache
    );
    const finalFee =
      concession !== undefined ? Math.max(0, Math.round(payload.totalFee - concession)) : payload.finalFee;
    const after: StoredFee = {
      totalFee: payload.totalFee,
      finalFee,
      amountPaid: row.amountPaid,
      remainingFee: concession !== undefined ? Math.max(0, Math.round(finalFee - row.amountPaid)) : payload.remainingFee,
    };
    const changed =
      Math.abs(before.totalFee - after.totalFee) > EPS ||
      Math.abs(before.finalFee - after.finalFee) > EPS ||
      Math.abs(before.remainingFee - after.remainingFee) > EPS ||
      Boolean(input.concessionRecord && row.discountFeeHeadKey !== input.concessionRecord.headKey);

    const hasDiscount =
      row.discountPercent > 0 || Boolean(row.discountFeeHeadKey?.trim()) || Boolean(row.discountRemarks?.trim());
    if (hasDiscount && !input.allowDiscount && concession === undefined) {
      plans.push({
        studentId,
        found: true,
        before,
        after,
        changed,
        blockedReason:
          "This student has a discount. Discount rules live in the profile breakdown; review them first, then re-run with --allow-discount",
      });
      continue;
    }
    plans.push({ studentId, found: true, before, after, changed });
  }

  if (input.apply) {
    for (const plan of plans) {
      if (!plan.found || !plan.changed || plan.blockedReason || !plan.after) continue;
      await db.studentFee.update({
        where: { studentId: plan.studentId },
        data: {
          totalFee: plan.after.totalFee,
          finalFee: plan.after.finalFee,
          remainingFee: plan.after.remainingFee,
          ...(input.concessionRecord && plan.after.totalFee > 0
            ? {
                discountPercent: Math.min(100, ((concession ?? 0) / plan.after.totalFee) * 100),
                discountFeeHeadKey: input.concessionRecord.headKey,
                discountFeeHeadLabel: input.concessionRecord.headLabel,
                discountRemarks: input.concessionRecord.remarks,
              }
            : {}),
        },
      });
      invalidateStudentFeeReadCaches({ studentId: plan.studentId, schoolId: input.schoolId });
    }
  }
  return plans;
}
