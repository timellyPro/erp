import prisma from "@/lib/db";
import { buildInstallmentFeeNames, installmentIndexFromName } from "@/lib/extraFeeInstallments";
import {
  isHostelCategoryExtraFeeName,
  isMessCategoryExtraFeeName,
  isStudentHosteller,
} from "@/lib/extraFeeResidencyScope";
import { repairOrphanExtraFeeAllocations } from "@/lib/repairOrphanExtraFeeAllocations";
import { repairLastYearMessTransportSplits } from "@/lib/repairLastYearMessTransportSplits";

type BackfillDb = Pick<
  typeof prisma,
  "$transaction" | "extraFee" | "paymentFeeAllocation" | "student" | "payment"
>;

/**
 * Persist fee head names on payment allocations and re-link orphan extraFeeIds
 * to live hostel/mess rows so Fees Sheet paid columns stay in sync.
 */
export async function backfillPaymentAllocationComponentNames(
  db: BackfillDb,
  schoolId: string,
  options?: { studentId?: string }
): Promise<{ fromExtraFee: number; inferredHostelMess: number; reassigned: number; lastYearSplit: number }> {
  const repaired = await repairOrphanExtraFeeAllocations(db, schoolId, options);
  const lastYearSplit = await repairLastYearMessTransportSplits(db, schoolId, options);
  let fromExtraFee = 0;
  let inferredHostelMess = 0;

  const orphanAllocations = await db.paymentFeeAllocation.findMany({
    where: {
      headType: "EXTRA_FEE",
      OR: [{ componentName: null }, { componentName: "" }],
      payment: {
        student: {
          schoolId,
          ...(options?.studentId ? { id: options.studentId } : {}),
        },
      },
    },
    select: {
      id: true,
      extraFeeId: true,
      allocatedAmount: true,
      studentId: true,
    },
  });

  if (orphanAllocations.length === 0) {
    return { fromExtraFee: 0, inferredHostelMess: 0, reassigned: repaired.reassigned, lastYearSplit: lastYearSplit.repaired };
  }

  const extraFeeIds = Array.from(
    new Set(orphanAllocations.map((a) => a.extraFeeId).filter((id): id is string => Boolean(id)))
  );

  const extraFees =
    extraFeeIds.length > 0
      ? await db.extraFee.findMany({
          where: { id: { in: extraFeeIds } },
          select: { id: true, name: true },
        })
      : [];
  const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));

  for (const [extraFeeId, rawName] of extraFeeNameById) {
    const name = rawName.trim();
    if (!name) continue;
    const ids = orphanAllocations.filter((a) => a.extraFeeId === extraFeeId).map((a) => a.id);
    if (ids.length === 0) continue;
    const result = await db.paymentFeeAllocation.updateMany({
      where: { id: { in: ids } },
      data: { componentName: name },
    });
    fromExtraFee += result.count;
  }

  const stillOrphan = orphanAllocations.filter(
    (a) => a.extraFeeId && !extraFeeNameById.has(a.extraFeeId)
  );
  if (stillOrphan.length === 0) {
    return { fromExtraFee, inferredHostelMess, reassigned: repaired.reassigned, lastYearSplit: lastYearSplit.repaired };
  }

  const [schoolHostelFees, schoolMessFees, students] = await Promise.all([
    db.extraFee.findMany({
      where: { schoolId, targetType: "SCHOOL" },
      select: { id: true, name: true, amount: true },
    }),
    db.extraFee.findMany({
      where: { schoolId, targetType: "SCHOOL" },
      select: { id: true, name: true, amount: true },
    }),
    db.student.findMany({
      where: {
        id: { in: [...new Set(stillOrphan.map((a) => a.studentId))] },
        schoolId,
      },
      select: { id: true, residencyType: true },
    }),
  ]);

  const hostelFees = schoolHostelFees.filter((f) => isHostelCategoryExtraFeeName(f.name));
  const messFees = schoolMessFees.filter((f) => isMessCategoryExtraFeeName(f.name));
  const residencyByStudentId = new Map(students.map((s) => [s.id, s.residencyType]));

  const inferName = (
    amount: number,
    fees: Array<{ name: string; amount: number }>
  ): string | null => {
    if (fees.length === 0) return null;
    const exact = fees.find((f) => Math.abs(Number(f.amount) - amount) < 0.02);
    if (exact) return exact.name.trim();
    const base = fees[0]!.name.trim();
    const [n1, n2] = buildInstallmentFeeNames(base);
    const firstAmt = Math.round((fees.reduce((s, f) => s + Number(f.amount), 0) / 2) * 100) / 100;
    const secondAmt = Math.round((fees.reduce((s, f) => s + Number(f.amount), 0) - firstAmt) * 100) / 100;
    if (Math.abs(amount - firstAmt) < 0.02) return n1;
    if (Math.abs(amount - secondAmt) < 0.02) return n2;
    for (const f of fees) {
      const idx = installmentIndexFromName(f.name);
      if (idx === 1 && Math.abs(Number(f.amount) - amount) < 0.02) return f.name.trim();
      if (idx === 2 && Math.abs(Number(f.amount) - amount) < 0.02) return f.name.trim();
    }
    return base;
  };

  const inferredByName = new Map<string, string[]>();
  for (const alloc of stillOrphan) {
    const residency = residencyByStudentId.get(alloc.studentId);
    const host = isStudentHosteller(residency);
    const amount = Number(alloc.allocatedAmount) || 0;
    if (amount <= 0) continue;

    let inferred: string | null = null;
    if (host && hostelFees.length > 0) {
      inferred = inferName(amount, hostelFees);
    } else if (!host && messFees.length > 0) {
      inferred = inferName(amount, messFees);
    }
    if (!inferred) continue;

    const list = inferredByName.get(inferred) ?? [];
    list.push(alloc.id);
    inferredByName.set(inferred, list);
  }

  for (const [inferred, ids] of inferredByName) {
    const result = await db.paymentFeeAllocation.updateMany({
      where: { id: { in: ids } },
      data: { componentName: inferred },
    });
    inferredHostelMess += result.count;
  }

  return { fromExtraFee, inferredHostelMess, reassigned: repaired.reassigned, lastYearSplit: lastYearSplit.repaired };
}

/** Snapshot fee name onto allocations before deleting an extra-fee row. */
export async function snapshotExtraFeeNameOnAllocations(
  db: Pick<typeof prisma, "paymentFeeAllocation">,
  extraFeeId: string,
  feeName: string
): Promise<number> {
  const result = await db.paymentFeeAllocation.updateMany({
    where: {
      extraFeeId,
      headType: "EXTRA_FEE",
      OR: [{ componentName: null }, { componentName: "" }],
    },
    data: { componentName: feeName.trim() },
  });
  return result.count;
}
