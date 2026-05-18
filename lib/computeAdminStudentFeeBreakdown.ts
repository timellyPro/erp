import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { redistributeBaseMinusOneAllocations } from "@/lib/redistributeBaseMinusOneAllocations";
import { rollupOrphanExtraFeeAllocations } from "@/lib/rollupOrphanExtraFeeAllocations";
import {
  discountedSnapshotDueForHead,
  studentFeeDiscountFromRecord,
} from "@/lib/studentFeeHeadDiscount";
import {
  computeStudentTuitionParts,
  finalFeeFromStructureAndExtras,
  shouldOmitLegacySplitHostelMessExtraForBreakdown,
  upsertStudentFeeFromStructure,
} from "@/lib/studentTuitionFromStructure";
import { extraFeeAppliesToStudent } from "@/lib/extraFeeResidencyScope";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";
import { isInstallmentFeeName, isUnsplitLumpExtraFee } from "@/lib/extraFeeInstallments";
import { formatFeeHeadDisplayLabel } from "@/lib/feeHeadInstallmentDisplay";
import { cleanupDuplicateHostelMessExtraFees } from "@/lib/cleanupDuplicateHostelMessExtraFees";
import { migrateUnsplitLumpExtraFees } from "@/lib/extraFeeInstallmentDb";

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
      snapshotAmount: number;
      dueBefore: number;
    }
  | {
      key: string;
      headType: "EXTRA_FEE";
      label: string;
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
  dueHeads: AdminFeeBreakdownDueHead[];
};

type InternalHead =
  | { key: string; headType: "BASE_COMPONENT"; label: string; snapshotDue: number }
  | {
      key: string;
      headType: "EXTRA_FEE";
      label: string;
      snapshotDue: number;
      extraFeeId: string;
      canDeleteOnStudentProfile: boolean;
      splitIntoTwoInstallments: boolean;
    };

/** Shared fee-head breakdown for profile / payment UI. Set migrateLumps false on read-heavy paths. */
export async function computeAdminStudentFeeBreakdown(
  schoolId: string,
  studentId: string,
  options?: { migrateLumps?: boolean; cleanupHostelMessDuplicates?: boolean }
): Promise<AdminStudentFeeBreakdownResult> {
  const migrateLumps = options?.migrateLumps !== false;

  if (options?.cleanupHostelMessDuplicates === true) {
    await cleanupDuplicateHostelMessExtraFees(prisma, schoolId);
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true,
      residencyType: true,
      class: { select: { id: true, section: true } },
    },
  });
  if (!student) {
    throw new Error("Student not found");
  }

  const fee = await prisma.studentFee.findUnique({
    where: { studentId: student.id },
    select: {
      amountPaid: true,
      finalFee: true,
      totalFee: true,
      discountPercent: true,
      discountFeeHeadKey: true,
      discountFeeHeadLabel: true,
    },
  });
  if (!fee) {
    throw new Error("Fee record not found for this student");
  }
  const classId = student.class?.id ?? null;
  const classSection = student.class?.section ?? null;

  const classFeeStructure = classId
    ? await prisma.classFeeStructure.findUnique({
        where: { classId },
        select: { components: true },
      })
    : null;

  const baseComps =
    ((classFeeStructure?.components as Array<{ name: string; amount: number }> | null) ?? []).map(
      (c) => ({
        name: c.name,
        amount: Number(c.amount) || 0,
      })
    );

  const discount = studentFeeDiscountFromRecord(fee, baseComps);

  const extraFeeWhere = {
    schoolId,
    OR: [
      { targetType: "SCHOOL" as const },
      ...(classId ? [{ targetType: "CLASS" as const, targetClassId: classId }] : []),
      ...(classId && classSection
        ? [{ targetType: "SECTION" as const, targetClassId: classId, targetSection: classSection }]
        : []),
      { targetType: "STUDENT" as const, targetStudentId: student.id },
    ],
  };

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

  let extraFeesRaw: ExtraFeeBreakdownRow[];
  try {
    extraFeesRaw = await prisma.extraFee.findMany({
      where: extraFeeWhere,
      select: { ...extraFeeSelectBase, splitIntoTwoInstallments: true } as typeof extraFeeSelectBase & {
        splitIntoTwoInstallments: true;
      },
    });
  } catch (e) {
    if (!isUnknownExtraFeeSplitFieldError(e)) throw e;
    const rows = await prisma.extraFee.findMany({
      where: extraFeeWhere,
      select: extraFeeSelectBase,
    });
    extraFeesRaw = rows.map((r) => ({ ...r, splitIntoTwoInstallments: false }));
  }

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
      extraFeesRaw = await prisma.extraFee.findMany({
        where: extraFeeWhere,
        select: { ...extraFeeSelectBase, splitIntoTwoInstallments: true } as typeof extraFeeSelectBase & {
          splitIntoTwoInstallments: true;
        },
      });
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
        snapshotDue: discountedSnapshotDueForHead(key, preDue, discount),
      };
    }),
    ...extraFees.map((ef): InternalHead => {
      const key = `EXTRA:${ef.id}`;
      const preDue = Number(ef.amount) || 0;
      return {
        key,
        headType: "EXTRA_FEE",
        label: formatFeeHeadDisplayLabel(ef.name),
        snapshotDue: discountedSnapshotDueForHead(key, preDue, discount),
        extraFeeId: ef.id,
        canDeleteOnStudentProfile: ef.targetType === "STUDENT" && ef.targetStudentId === student.id,
        splitIntoTwoInstallments:
          Boolean(ef.splitIntoTwoInstallments) && !isInstallmentFeeName(ef.name),
      };
    }),
  ];

  const extraFeesById = new Map(extraFeesRaw.map((ef) => [ef.id, { id: ef.id, name: ef.name }]));

  const [paymentAllocations, refundAllocations] = await Promise.all([
    prisma.paymentFeeAllocation.groupBy({
      by: ["headType", "componentIndex", "extraFeeId"],
      where: {
        studentId: student.id,
        allocationType: "PAYMENT",
        payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
      },
      _sum: { allocatedAmount: true },
    }),
    prisma.paymentFeeAllocation.groupBy({
      by: ["headType", "componentIndex", "extraFeeId"],
      where: {
        studentId: student.id,
        allocationType: "REFUND",
        payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
      },
      _sum: { allocatedAmount: true },
    }),
  ]);

  const netPaidByHead = new Map<string, number>();
  for (const a of paymentAllocations) {
    const key = a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
    netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) + (a._sum.allocatedAmount ?? 0));
  }
  for (const a of refundAllocations) {
    const key = a.headType === "BASE_COMPONENT" ? `BASE:${a.componentIndex}` : `EXTRA:${a.extraFeeId}`;
    netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) - (a._sum.allocatedAmount ?? 0));
  }

  redistributeBaseMinusOneAllocations(netPaidByHead, allHeads);
  rollupOrphanExtraFeeAllocations(
    netPaidByHead,
    allHeads.map((h) => ({
      key: h.key,
      label: h.label,
      extraFeeId: h.headType === "EXTRA_FEE" ? h.extraFeeId : undefined,
    })),
    extraFeesById
  );

  const allocationsNetTotal = Array.from(netPaidByHead.values()).reduce((s, v) => s + v, 0);
  const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);
  const totalSnapshotDue = Math.max(allHeads.reduce((s, h) => s + h.snapshotDue, 0), 0);

  const dueHeads: AdminFeeBreakdownDueHead[] = allHeads.map((h) => {
    const paidAlloc = netPaidByHead.get(h.key) ?? 0;
    const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (h.snapshotDue / totalSnapshotDue) : 0;
    const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
    const dueBefore = Math.max(h.snapshotDue - paidBefore, 0);

    if (h.headType === "BASE_COMPONENT") {
      return {
        key: h.key,
        headType: "BASE_COMPONENT",
        label: h.label,
        snapshotAmount: h.snapshotDue,
        dueBefore,
      };
    }
    return {
      key: h.key,
      headType: "EXTRA_FEE",
      label: h.label,
      snapshotAmount: h.snapshotDue,
      dueBefore,
      extraFeeId: h.extraFeeId,
      canDeleteOnStudentProfile: h.canDeleteOnStudentProfile,
      splitIntoTwoInstallments: h.splitIntoTwoInstallments,
    };
  });

  const totalDueBefore = dueHeads.reduce((s, h) => s + h.dueBefore, 0);
  const totalAmount = dueHeads.reduce((s, h) => s + h.snapshotAmount, 0);

  let amountPaid = fee.amountPaid;
  let finalFee = fee.finalFee;
  let remainingFee = totalDueBefore;

  const tuitionParts = await computeStudentTuitionParts(prisma, {
    schoolId,
    classId,
    section: classSection,
    studentId: student.id,
    residencyType: residency,
  });
  const expectedFinal = finalFeeFromStructureAndExtras(
    tuitionParts.base,
    tuitionParts.extrasTotal,
    fee.discountPercent
  );

  /** Stale StudentFee rows (e.g. after removing bulk mess extras) — realign stored totals with structure. */
  if (
    Math.abs(finalFee - expectedFinal) > 0.02 ||
    Math.abs(fee.totalFee - tuitionParts.totalFee) > 0.02
  ) {
    await upsertStudentFeeFromStructure(prisma, {
      schoolId,
      studentId: student.id,
      classId,
      section: classSection,
      discountPercent: fee.discountPercent,
      amountPaid: fee.amountPaid,
      residencyType: residency,
    });
    const synced = await prisma.studentFee.findUnique({
      where: { studentId: student.id },
      select: { finalFee: true, amountPaid: true, remainingFee: true },
    });
    if (synced) {
      finalFee = synced.finalFee;
      amountPaid = synced.amountPaid;
      remainingFee = Math.max(0, synced.remainingFee);
    }
  }

  return {
    studentId: student.id,
    remainingFee,
    totalAmount,
    amountPaid,
    finalFee,
    dueHeads,
  };
}
