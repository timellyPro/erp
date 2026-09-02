import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { redistributeBaseMinusOneAllocations } from "@/lib/redistributeBaseMinusOneAllocations";
import { rollupOrphanExtraFeeAllocations } from "@/lib/rollupOrphanExtraFeeAllocations";
import {
  discountedSnapshotDueForHead,
  studentFeeDiscountFromRecord,
} from "@/lib/studentFeeHeadDiscount";
import { roundRupee } from "@/lib/formatRupee";

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
import { shouldOmitLegacySplitHostelMessExtraForBreakdown } from "@/lib/studentTuitionFromStructure";
import { defaultSplitIntoTwoInstallmentsForFeeName } from "@/lib/extraFeeResidencyScope";
import { extraFeeAppliesToStudent } from "@/lib/extraFeeResidencyScope";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";
import { isInstallmentFeeName, isUnsplitLumpExtraFee } from "@/lib/extraFeeInstallments";
import { formatFeeHeadDisplayLabel } from "@/lib/feeHeadInstallmentDisplay";
import { loadExtraFeesForStudentScope } from "@/lib/loadExtraFeesForStudentScope";
import { sumSuccessfulFeePayments } from "@/lib/reconcileStudentFeeFromPayments";
import { cleanupDuplicateHostelMessExtraFees } from "@/lib/cleanupDuplicateHostelMessExtraFees";
import { migrateUnsplitLumpExtraFees } from "@/lib/extraFeeInstallmentDb";
import { isPreviousYearFeeHeadName } from "@/lib/feeYearClassification";
import { repairOrphanExtraFeeAllocations } from "@/lib/repairOrphanExtraFeeAllocations";

function normalizeExtraFeeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isUnknownExtraFeeSplitFieldError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientValidationError) {
    return (
      error.message.includes("Unknown field") && error.message.includes("splitIntoTwoInstallments")
    );
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Unknown field") && msg.includes("splitIntoTwoInstallments");
}

function dedupeExtraFeesForStudent<
  T extends {
    id: string;
    name: string;
    amount: number;
    targetType: string;
    targetStudentId: string | null;
    splitIntoTwoInstallments?: boolean;
  }
>(fees: T[], studentId: string): T[] {
  const priority = (f: T) => {
    if (f.targetType === "STUDENT" && f.targetStudentId === studentId) return 4;
    if (f.targetType === "SECTION") return 3;
    if (f.targetType === "CLASS") return 2;
    if (f.targetType === "SCHOOL") return 1;
    return 0;
  };
  const best = new Map<string, T>();
  for (const f of fees) {
    const amt = Math.round((Number(f.amount) || 0) * 100) / 100;
    const key = `${normalizeExtraFeeName(f.name)}|${amt}`;
    const cur = best.get(key);
    if (!cur || priority(f) > priority(cur)) best.set(key, f);
  }
  return Array.from(best.values());
}

export type AdminFeeBreakdownDueHead =
  | {
      key: string;
      headType: "BASE_COMPONENT";
      label: string;
      /** Pre-discount face value for this head. */
      grossAmount: number;
      snapshotAmount: number;
      dueBefore: number;
    }
  | {
      key: string;
      headType: "EXTRA_FEE";
      label: string;
      grossAmount: number;
      snapshotAmount: number;
      dueBefore: number;
      extraFeeId: string;
      canDeleteOnStudentProfile: boolean;
      splitIntoTwoInstallments: boolean;
    };

export type AdminStudentFeeBreakdownResult = {
  studentId: string;
  remainingFee: number;
  totalAmount: number;
  amountPaid: number;
  finalFee: number;
  previousYearTotalAmount?: number;
  previousYearAmountPaid?: number;
  previousYearRemainingFee?: number;
  dueHeads: AdminFeeBreakdownDueHead[];
};

type InternalHead =
  | { key: string; headType: "BASE_COMPONENT"; label: string; grossDue: number; snapshotDue: number }
  | {
      key: string;
      headType: "EXTRA_FEE";
      label: string;
      grossDue: number;
      snapshotDue: number;
      extraFeeId: string;
      canDeleteOnStudentProfile: boolean;
      splitIntoTwoInstallments: boolean;
    };

export type BreakdownStudentCtx = {
  id: string;
  residencyType: string | null;
  class: { id: string; section: string | null } | null;
};

const extraFeesScopeCache = new Map<
  string,
  { freshUntil: number; rows: Array<{
    id: string;
    name: string;
    amount: number;
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string;
    splitIntoTwoInstallments?: boolean;
  }> }
>();

const EXTRA_FEES_CACHE_TTL_MS = 300_000;

/** Drop cached extra-fee rows for a student after assign / create / delete mutations. */
export function invalidateExtraFeesScopeCacheForStudent(studentId?: string): void {
  if (!studentId) {
    extraFeesScopeCache.clear();
    return;
  }
  const suffix = `:${studentId}`;
  for (const key of extraFeesScopeCache.keys()) {
    if (key.endsWith(suffix)) extraFeesScopeCache.delete(key);
  }
}

const classFeeStructureCache = new Map<
  string,
  { freshUntil: number; row: { components: unknown } | null }
>();
const CLASS_FEE_STRUCTURE_TTL_MS = 300_000;

async function loadClassFeeStructure(classId: string) {
  const hit = classFeeStructureCache.get(classId);
  if (hit && Date.now() < hit.freshUntil) return hit.row;
  let row = await prisma.classFeeStructure.findUnique({
    where: { classId },
    select: { components: true },
  });
  if (!row?.components || !Array.isArray(row.components) || row.components.length === 0) {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { name: true, schoolId: true },
    });
    if (cls) {
      const nameKey = cls.name.trim().toLowerCase().replace(/\s+/g, " ");
      const siblings = await prisma.class.findMany({
        where: { schoolId: cls.schoolId, id: { not: classId } },
        select: { id: true, name: true },
      });
      const siblingIds = siblings
        .filter((s) => s.name.trim().toLowerCase().replace(/\s+/g, " ") === nameKey)
        .map((s) => s.id);
      if (siblingIds.length > 0) {
        const donor = await prisma.classFeeStructure.findFirst({
          where: { classId: { in: siblingIds } },
          select: { components: true },
        });
        if (donor) row = donor;
      }
    }
  }
  classFeeStructureCache.set(classId, {
    row,
    freshUntil: Date.now() + CLASS_FEE_STRUCTURE_TTL_MS,
  });
  return row;
}

/** Shared fee-head breakdown for profile / payment UI. Set migrateLumps false on read-heavy paths. */
export async function computeAdminStudentFeeBreakdown(
  schoolId: string,
  studentId: string,
  options?: {
    /** Skip second Student lookup when caller already loaded the row. */
    student?: BreakdownStudentCtx;
    migrateLumps?: boolean;
    cleanupHostelMessDuplicates?: boolean;
    /** When false, skip realigning StudentFee totals on read (faster student-details switch). */
    reconcileTotals?: boolean;
  }
): Promise<AdminStudentFeeBreakdownResult> {
  const migrateLumps = options?.migrateLumps !== false;
  const reconcileTotals = options?.reconcileTotals !== false;

  type ExtraFeeBreakdownRow = {
    id: string;
    name: string;
    amount: number;
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string;
    splitIntoTwoInstallments?: boolean;
  };

  if (options?.cleanupHostelMessDuplicates === true) {
    await cleanupDuplicateHostelMessExtraFees(prisma, schoolId);
  }

  const student =
    options?.student ??
    (await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        id: true,
        residencyType: true,
        class: { select: { id: true, section: true } },
      },
    }));
  if (!student) {
    throw new Error("Student not found");
  }

  const classId = student.class?.id ?? null;
  const classSection = student.class?.section ?? null;

  const extraFeeSelectBase = {
    id: true,
    name: true,
    amount: true,
    targetType: true,
    targetClassId: true,
    targetSection: true,
    targetStudentId: true,
    residencyScope: true,
  } as const;

  const extraFeesCacheKey = `${schoolId}:${classId ?? ""}:${classSection ?? ""}:${student.id}`;
  const extraFeesCached = extraFeesScopeCache.get(extraFeesCacheKey);
  const loadExtraFees = async (): Promise<ExtraFeeBreakdownRow[]> => {
    if (extraFeesCached && Date.now() < extraFeesCached.freshUntil) {
      return extraFeesCached.rows as ExtraFeeBreakdownRow[];
    }
    const scope = { schoolId, studentId: student.id, classId, classSection };
    const rows = await loadExtraFeesForStudentScope(
      scope,
      { ...extraFeeSelectBase, splitIntoTwoInstallments: true } as typeof extraFeeSelectBase & {
        splitIntoTwoInstallments: true;
      }
    ).catch(async (e) => {
      if (!isUnknownExtraFeeSplitFieldError(e)) throw e;
      const legacy = await loadExtraFeesForStudentScope(scope, extraFeeSelectBase);
      return legacy.map((r) => ({ ...r, splitIntoTwoInstallments: false }));
    });
    if (!migrateLumps) {
      extraFeesScopeCache.set(extraFeesCacheKey, {
        rows: rows as ExtraFeeBreakdownRow[],
        freshUntil: Date.now() + EXTRA_FEES_CACHE_TTL_MS,
      });
    }
    return rows as ExtraFeeBreakdownRow[];
  };

  const [
    studentFeeRecord,
    classFeeStructure,
    extraFeesRawFirst,
    groupedAllocations,
    approvedDiscounts,
  ] = await Promise.all([
    prisma.studentFee.findUnique({
      where: { studentId: student.id },
      select: {
        amountPaid: true,
        finalFee: true,
        totalFee: true,
        remainingFee: true,
        discountPercent: true,
        discountFeeHeadKey: true,
        discountFeeHeadLabel: true,
      },
    }),
    classId ? loadClassFeeStructure(classId) : Promise.resolve(null),
    loadExtraFees(),
    prisma.paymentFeeAllocation.groupBy({
      by: ["allocationType", "headType", "componentIndex", "extraFeeId"],
      where: {
        studentId: student.id,
        allocationType: { in: ["PAYMENT", "REFUND"] },
        payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
      },
      _sum: { allocatedAmount: true },
    }),
    prisma.feeDiscountApproval.findMany({
      where: {
        studentId: student.id,
        status: "APPROVED",
      },
      orderBy: { reviewedAt: "asc" },
      select: {
        discountPercent: true,
        discountFixedAmount: true,
        discountFeeHeadKey: true,
        discountFeeHeadLabel: true,
      },
    }),
  ]);
  let fee = studentFeeRecord;

  if (reconcileTotals && fee) {
    const paymentSum = await sumSuccessfulFeePayments(student.id);
    if (Math.abs(fee.amountPaid - paymentSum) > 0.02) {
      const remainingFee = Math.max(Math.round((fee.finalFee - paymentSum) * 100) / 100, 0);
      fee = await prisma.studentFee.update({
        where: { studentId: student.id },
        data: { amountPaid: paymentSum, remainingFee },
        select: {
          amountPaid: true,
          finalFee: true,
          totalFee: true,
          remainingFee: true,
          discountPercent: true,
          discountFeeHeadKey: true,
          discountFeeHeadLabel: true,
        },
      });
    }
  }

  if (!fee) {
    throw new Error("Fee record not found for this student");
  }

  let extraFeesRaw = extraFeesRawFirst as ExtraFeeBreakdownRow[];

  const baseComps =
    ((classFeeStructure?.components as Array<{ name: string; amount: number }> | null) ?? []).map(
      (c) => ({
        name: c.name,
        amount: Number(c.amount) || 0,
      })
    );

  const fallbackDiscount = studentFeeDiscountFromRecord(fee, baseComps);
  const approvedDiscountInputs = approvedDiscounts.map((approval) => ({
    discountPercent: approval.discountPercent,
    discountFeeHeadKey: approval.discountFeeHeadKey,
    discountFixedAmount: approval.discountFixedAmount,
  }));
  const discountInputs = approvedDiscountInputs.length > 0 ? approvedDiscountInputs : [fallbackDiscount];
  const discountedDue = (key: string, preDue: number) =>
    discountInputs.reduce(
      (due, discount) => discountedSnapshotDueForHead(key, due, discount),
      preDue
    );

  if (migrateLumps) {
    const lumpsToMigrate = extraFeesRaw.filter((ef) =>
      isUnsplitLumpExtraFee({
        name: ef.name,
        splitIntoTwoInstallments: Boolean(ef.splitIntoTwoInstallments),
      })
    );
    if (lumpsToMigrate.length > 0) {
      await migrateUnsplitLumpExtraFees(
        prisma,
        lumpsToMigrate.map((ef) => ({
          ...ef,
          schoolId,
          splitIntoTwoInstallments: Boolean(ef.splitIntoTwoInstallments),
        }))
      );
      extraFeesRaw = await loadExtraFeesForStudentScope(
        { schoolId, studentId: student.id, classId, classSection },
        { ...extraFeeSelectBase, splitIntoTwoInstallments: true } as typeof extraFeeSelectBase & {
          splitIntoTwoInstallments: true;
        }
      );
    }
  }

  const residency = student.residencyType ?? "Day Scholar";
  const rte = isStudentRte(residency);
  const extraFees = dedupeExtraFeesForStudent(
    extraFeesRaw.filter((ef) =>
      extraFeeAppliesToStudent({ name: ef.name, residencyScope: ef.residencyScope }, residency)
    ),
    student.id
  )
    .filter(
      (ef) =>
        !shouldOmitLegacySplitHostelMessExtraForBreakdown(ef, extraFeesRaw, {
          classId,
          residencyType: residency,
        })
    )
    .filter((ef) => !(rte && isTuitionNamedExtraFee(ef.name)));

  const allHeads: InternalHead[] = [
    ...baseComps.map((c, idx): InternalHead => {
      const key = `BASE:${idx}`;
      const preDue = rte ? 0 : Number(c.amount) || 0;
      return {
        key,
        headType: "BASE_COMPONENT",
        label: c.name,
        grossDue: preDue,
        snapshotDue: discountedDue(key, preDue),
      };
    }),
    ...extraFees.map((ef): InternalHead => {
      const key = `EXTRA:${ef.id}`;
      const preDue = Number(ef.amount) || 0;
      return {
        key,
        headType: "EXTRA_FEE",
        label: formatFeeHeadDisplayLabel(ef.name),
        grossDue: preDue,
        snapshotDue: discountedDue(key, preDue),
        extraFeeId: ef.id,
        canDeleteOnStudentProfile: ef.targetType === "STUDENT" && ef.targetStudentId === student.id,
        splitIntoTwoInstallments:
          !isInstallmentFeeName(ef.name) &&
          (Boolean(ef.splitIntoTwoInstallments) ||
            defaultSplitIntoTwoInstallmentsForFeeName(ef.name)),
      };
    }),
  ];

  const extraFeesById = new Map(extraFeesRaw.map((ef) => [ef.id, { id: ef.id, name: ef.name }]));

  const netPaidByHead = new Map<string, number>();
  for (const a of groupedAllocations) {
    const key = a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
    const amount = a._sum.allocatedAmount ?? 0;
    const sign = a.allocationType === "REFUND" ? -1 : 1;
    netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) + sign * amount);
  }

  /** Names for allocation extraFeeIds not in scoped extras (deleted lumps / other-class rows). */
  const orphanAllocationIds = [
    ...new Set(
      groupedAllocations
        .filter((a) => a.headType === "EXTRA_FEE" && a.extraFeeId && !extraFeesById.has(a.extraFeeId))
        .map((a) => a.extraFeeId as string)
    ),
  ];
  if (orphanAllocationIds.length > 0) {
    const orphanFees = await prisma.extraFee.findMany({
      where: { id: { in: orphanAllocationIds } },
      select: { id: true, name: true },
    });
    for (const ef of orphanFees) {
      extraFeesById.set(ef.id, { id: ef.id, name: ef.name });
    }

    const stillMissing = orphanAllocationIds.filter((id) => !extraFeesById.has(id));
    if (stillMissing.length > 0) {
      const snapRows = await prisma.paymentFeeAllocation.findMany({
        where: {
          studentId: student.id,
          headType: "EXTRA_FEE",
          extraFeeId: { in: stillMissing },
          NOT: [{ componentName: null }, { componentName: "" }],
        },
        select: { extraFeeId: true, componentName: true },
      });
      for (const row of snapRows) {
        const name = row.componentName?.trim();
        if (row.extraFeeId && name && !extraFeesById.has(row.extraFeeId)) {
          extraFeesById.set(row.extraFeeId, { id: row.extraFeeId, name });
        }
      }
    }
  }

  redistributeBaseMinusOneAllocations(netPaidByHead, allHeads);
  rollupOrphanExtraFeeAllocations(
    netPaidByHead,
    allHeads.map((h) => ({
      key: h.key,
      label: h.label,
      extraFeeId: h.headType === "EXTRA_FEE" ? h.extraFeeId : undefined,
      snapshotDue: h.snapshotDue,
    })),
    extraFeesById
  );

  /** Per-head paid comes from allocations only — never spread leftover amountPaid across all heads. */
  const legacyPaidTotal = 0;
  const totalSnapshotDue = Math.max(allHeads.reduce((s, h) => s + h.snapshotDue, 0), 0);

  const dueHeads: AdminFeeBreakdownDueHead[] = allHeads.map((h) => {
    const paidAlloc = netPaidByHead.get(h.key) ?? 0;
    const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (h.snapshotDue / totalSnapshotDue) : 0;
    const paidBefore = roundMoney(Math.max(paidAlloc + paidLegacy, 0));
    const dueBefore = roundMoney(Math.max(h.snapshotDue - paidBefore, 0));
    const grossAmount = roundMoney(h.grossDue);
    const snapshotAmount = roundMoney(h.snapshotDue);

    if (h.headType === "BASE_COMPONENT") {
      return {
        key: h.key,
        headType: "BASE_COMPONENT",
        label: h.label,
        grossAmount,
        snapshotAmount,
        dueBefore,
      };
    }
    return {
      key: h.key,
      headType: "EXTRA_FEE",
      label: h.label,
      grossAmount,
      snapshotAmount,
      dueBefore,
      extraFeeId: h.extraFeeId,
      canDeleteOnStudentProfile: h.canDeleteOnStudentProfile,
      splitIntoTwoInstallments: h.splitIntoTwoInstallments,
    };
  });

  const currentYearHeads = dueHeads.filter((h) => !isPreviousYearFeeHeadName(h.label));
  const previousYearHeads = dueHeads.filter((h) => isPreviousYearFeeHeadName(h.label));
  const totalDueBefore = roundMoney(currentYearHeads.reduce((s, h) => s + h.dueBefore, 0));
  const totalAmount = roundMoney(currentYearHeads.reduce((s, h) => s + h.snapshotAmount, 0));
  const currentYearPaid = roundMoney(
    currentYearHeads.reduce((s, h) => s + Math.max(h.snapshotAmount - h.dueBefore, 0), 0)
  );
  const previousYearTotalAmount = roundMoney(previousYearHeads.reduce((s, h) => s + h.snapshotAmount, 0));
  const previousYearRemainingFee = roundMoney(previousYearHeads.reduce((s, h) => s + h.dueBefore, 0));
  const previousYearAmountPaid = roundMoney(
    previousYearHeads.reduce((s, h) => s + Math.max(h.snapshotAmount - h.dueBefore, 0), 0)
  );

  const amountPaid = currentYearPaid;
  let finalFee = fee.finalFee;
  let remainingFee = totalDueBefore;

  const expectedFinal = totalAmount;
  const storedExpectedFinal = roundMoney(dueHeads.reduce((s, h) => s + h.snapshotAmount, 0));
  const storedExpectedRemaining = roundMoney(dueHeads.reduce((s, h) => s + h.dueBefore, 0));
  const expectedTotalFee = roundMoney(dueHeads.reduce((s, h) => s + h.grossAmount, 0));

  remainingFee = totalDueBefore;
  finalFee = expectedFinal;

  /** Realign stored totals from fee heads (per-head discounts stay correct; avoids float noise in remainingFee). */
  if (
    reconcileTotals &&
    (Math.abs(fee.totalFee - expectedTotalFee) > 0.02 ||
      Math.abs(fee.finalFee - storedExpectedFinal) > 0.02 ||
      Math.abs(fee.remainingFee - storedExpectedRemaining) > 0.02)
  ) {
    await prisma.studentFee.update({
      where: { studentId: student.id },
      data: {
        totalFee: expectedTotalFee,
        finalFee: storedExpectedFinal,
        remainingFee: storedExpectedRemaining,
      },
    });
  }

  return {
    studentId: student.id,
    remainingFee: roundRupee(remainingFee),
    totalAmount,
    amountPaid,
    finalFee,
    previousYearTotalAmount,
    previousYearAmountPaid,
    previousYearRemainingFee,
    dueHeads,
  };
}
