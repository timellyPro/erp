import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import {
  baseNameFromInstallmentFee,
  buildInstallmentFeeNames,
  findInstallmentPair,
  isInstallmentFeeName,
  isUnsplitLumpExtraFee,
  shouldMigrateLumpToInstallmentsOnPatch,
  shouldPersistAsTwoInstallmentRecords,
  splitAmountInHalf,
} from "@/lib/extraFeeInstallments";

const LOG_PREFIX = "[ExtraFee Installments]";

/** Server console logs for installment split / PATCH (visible in `npm run dev` terminal). */
export function logExtraFeeInstallment(
  step: string,
  detail: Record<string, unknown> = {}
) {
  console.log(`${LOG_PREFIX} ${step}`, detail);
}

export type ExtraFeeCreatePayload = {
  schoolId: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string;
  splitIntoTwoInstallments: boolean;
};

type ExtraFeeDb = Pick<typeof prisma, "extraFee" | "paymentFeeAllocation">;

function rowDataFromPayload(
  payload: ExtraFeeCreatePayload,
  name: string,
  amount: number
): Prisma.ExtraFeeUncheckedCreateInput {
  return {
    schoolId: payload.schoolId,
    name,
    amount,
    targetType: payload.targetType,
    targetClassId: payload.targetClassId,
    targetSection: payload.targetSection,
    targetStudentId: payload.targetStudentId,
    residencyScope: payload.residencyScope,
    splitIntoTwoInstallments: false,
  };
}

export function buildExtraFeeRowsToCreate(
  payload: ExtraFeeCreatePayload
): Prisma.ExtraFeeUncheckedCreateInput[] {
  if (!shouldPersistAsTwoInstallmentRecords(payload.splitIntoTwoInstallments, payload.name)) {
    return [rowDataFromPayload(payload, payload.name.trim(), payload.amount)];
  }
  const [a1, a2] = splitAmountInHalf(payload.amount);
  const [n1, n2] = buildInstallmentFeeNames(payload.name);
  return [rowDataFromPayload(payload, n1, a1), rowDataFromPayload(payload, n2, a2)];
}

/** Move payment allocations from a lump extra-fee id onto two new installment ids. */
export async function reassignAllocationsToInstallmentPair(
  db: ExtraFeeDb,
  oldExtraFeeId: string,
  newFirstId: string,
  newSecondId: string,
  firstCap: number
) {
  const allocations = await db.paymentFeeAllocation.findMany({
    where: { extraFeeId: oldExtraFeeId, headType: "EXTRA_FEE" },
    orderBy: { createdAt: "asc" },
  });
  if (allocations.length === 0) return;

  let inst1Remaining = firstCap;

  for (const alloc of allocations) {
    const amt = Number(alloc.allocatedAmount) || 0;
    if (amt <= 0) continue;

    const toFirst = Math.min(amt, Math.max(inst1Remaining, 0));
    const toSecond = amt - toFirst;
    inst1Remaining -= toFirst;

    if (toFirst > 0) {
      await db.paymentFeeAllocation.update({
        where: { id: alloc.id },
        data: { extraFeeId: newFirstId, allocatedAmount: toFirst },
      });
    } else {
      await db.paymentFeeAllocation.delete({ where: { id: alloc.id } });
    }

    if (toSecond > 0) {
      await db.paymentFeeAllocation.create({
        data: {
          paymentId: alloc.paymentId,
          studentId: alloc.studentId,
          headType: "EXTRA_FEE",
          extraFeeId: newSecondId,
          allocationType: alloc.allocationType,
          allocatedAmount: toSecond,
          componentIndex: null,
          componentName: null,
        },
      });
    }
  }
}

/**
 * Replace one lump extra fee (splitIntoTwoInstallments) with two installment rows.
 * Total amount unchanged; existing allocations are split across installments in order.
 */
export async function migrateUnsplitLumpExtraFee(
  db: Pick<typeof prisma, "$transaction" | "extraFee" | "paymentFeeAllocation">,
  lump: {
    id: string;
    schoolId: string;
    name: string;
    amount: number;
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string;
    splitIntoTwoInstallments: boolean;
  },
  options?: { force?: boolean }
): Promise<{ firstId: string; secondId: string } | null> {
  if (isInstallmentFeeName(lump.name)) return null;
  if (!isUnsplitLumpExtraFee(lump) && !options?.force) return null;

  const base = baseNameFromInstallmentFee(lump.name);
  const [a1, a2] = splitAmountInHalf(lump.amount);
  const [n1, n2] = buildInstallmentFeeNames(base);
  const payload: ExtraFeeCreatePayload = {
    schoolId: lump.schoolId,
    name: base,
    amount: lump.amount,
    targetType: lump.targetType,
    targetClassId: lump.targetClassId,
    targetSection: lump.targetSection,
    targetStudentId: lump.targetStudentId,
    residencyScope: lump.residencyScope,
    splitIntoTwoInstallments: true,
  };

  logExtraFeeInstallment("MIGRATE lump → 2 DB rows", {
    lumpId: lump.id,
    lumpName: lump.name,
    total: lump.amount,
    first: { name: n1, amount: a1 },
    second: { name: n2, amount: a2 },
    targetType: lump.targetType,
    forced: Boolean(options?.force),
  });

  const [first, second] = await db.$transaction(async (tx) => {
    const t = tx;
    const created1 = await t.extraFee.create({
      data: rowDataFromPayload(payload, n1, a1),
    });
    const created2 = await t.extraFee.create({
      data: rowDataFromPayload(payload, n2, a2),
    });
    await reassignAllocationsToInstallmentPair(t, lump.id, created1.id, created2.id, a1);
    await t.extraFee.delete({ where: { id: lump.id } });
    return [created1, created2] as const;
  });

  logExtraFeeInstallment("MIGRATE complete", {
    deletedLumpId: lump.id,
    firstId: first.id,
    secondId: second.id,
  });

  return { firstId: first.id, secondId: second.id };
}

export async function createExtraFeeRows(
  db: Pick<typeof prisma, "$transaction" | "extraFee">,
  payload: ExtraFeeCreatePayload
): Promise<{ ids: string[]; totalAmount: number }> {
  const rows = buildExtraFeeRowsToCreate(payload);
  const created = await db.$transaction(rows.map((data) => db.extraFee.create({ data })));
  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  logExtraFeeInstallment(rows.length > 1 ? "POST created 2 installment rows" : "POST created 1 row", {
    name: payload.name,
    totalAmount,
    rowCount: rows.length,
    ids: created.map((c) => c.id),
    rowNames: rows.map((r) => r.name),
    rowAmounts: rows.map((r) => r.amount),
  });

  return { ids: created.map((c) => c.id), totalAmount };
}

/** Update both installment rows when admin changes the combined total. */
export async function updateInstallmentPairTotal(
  db: Pick<typeof prisma, "$transaction" | "extraFee">,
  firstId: string,
  secondId: string,
  newTotal: number
) {
  const [a1, a2] = splitAmountInHalf(newTotal);
  await db.$transaction([
    db.extraFee.update({ where: { id: firstId }, data: { amount: a1 } }),
    db.extraFee.update({ where: { id: secondId }, data: { amount: a2 } }),
  ]);
}

export async function updateInstallmentPairNames(
  db: Pick<typeof prisma, "$transaction" | "extraFee">,
  firstId: string,
  secondId: string,
  baseName: string
) {
  const [n1, n2] = buildInstallmentFeeNames(baseName.trim());
  await db.$transaction([
    db.extraFee.update({ where: { id: firstId }, data: { name: n1, splitIntoTwoInstallments: false } }),
    db.extraFee.update({ where: { id: secondId }, data: { name: n2, splitIntoTwoInstallments: false } }),
  ]);
}

function sameExtraFeeTargetScope(
  a: {
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string;
  },
  b: {
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string;
  }
) {
  return (
    a.targetType === b.targetType &&
    a.targetClassId === b.targetClassId &&
    a.targetSection === b.targetSection &&
    a.targetStudentId === b.targetStudentId &&
    a.residencyScope === b.residencyScope
  );
}

export type PatchExtraFeeInstallmentBody = {
  name?: string;
  amount?: number;
  splitIntoTwoInstallments?: boolean;
  combinedInstallmentTotal?: number;
};

export type PatchExtraFeeInstallmentResult = {
  extraFee: NonNullable<Awaited<ReturnType<typeof prisma.extraFee.findFirst>>>;
  extraFeeIds: string[];
  splitApplied: boolean;
  migrated: boolean;
  studentFeeDelta: number;
};

/**
 * One PATCH path for all extra fees: existing lumps split into two rows; pairs update both halves.
 */
export async function patchExtraFeeWithInstallmentSupport(
  db: Pick<typeof prisma, "$transaction" | "extraFee" | "paymentFeeAllocation">,
  extraFee: {
    id: string;
    schoolId: string;
    name: string;
    amount: number;
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string;
    splitIntoTwoInstallments: boolean;
  },
  body: PatchExtraFeeInstallmentBody
): Promise<PatchExtraFeeInstallmentResult | "no_changes"> {
  logExtraFeeInstallment("PATCH start", {
    feeId: extraFee.id,
    feeName: extraFee.name,
    currentAmount: extraFee.amount,
    dbSplitFlag: extraFee.splitIntoTwoInstallments,
    body,
    isInstallmentName: isInstallmentFeeName(extraFee.name),
  });

  const wantsSplit =
    body.splitIntoTwoInstallments === true ||
    (body.splitIntoTwoInstallments !== false && extraFee.splitIntoTwoInstallments);

  const combinedTotal =
    typeof body.combinedInstallmentTotal === "number" && body.combinedInstallmentTotal > 0
      ? body.combinedInstallmentTotal
      : typeof body.amount === "number" && body.amount > 0 && wantsSplit && !isInstallmentFeeName(extraFee.name)
        ? body.amount
        : null;

  const baseName = isInstallmentFeeName(extraFee.name)
    ? baseNameFromInstallmentFee(extraFee.name)
    : String(body.name ?? extraFee.name).trim();

  const scoped = await db.extraFee.findMany({
    where: {
      schoolId: extraFee.schoolId,
      targetType: extraFee.targetType,
      targetClassId: extraFee.targetClassId,
      targetSection: extraFee.targetSection,
      targetStudentId: extraFee.targetStudentId,
      residencyScope: extraFee.residencyScope,
    },
  });

  const pair = findInstallmentPair(scoped, baseName, (f) => sameExtraFeeTargetScope(f, extraFee));

  logExtraFeeInstallment("PATCH resolved", {
    baseName,
    wantsSplit,
    combinedTotal,
    foundPair: pair
      ? {
          firstId: pair.first.id,
          firstName: pair.first.name,
          firstAmount: pair.first.amount,
          secondId: pair.second.id,
          secondName: pair.second.name,
          secondAmount: pair.second.amount,
        }
      : null,
    scopedRowCount: scoped.length,
  });

  if (pair) {
    const prevTotal = (Number(pair.first.amount) || 0) + (Number(pair.second.amount) || 0);
    let studentFeeDelta = 0;

    if (combinedTotal !== null && Math.abs(combinedTotal - prevTotal) > 0.001) {
      await updateInstallmentPairTotal(db, pair.first.id, pair.second.id, combinedTotal);
      studentFeeDelta = combinedTotal - prevTotal;
    } else if (
      typeof body.amount === "number" &&
      body.amount > 0 &&
      isInstallmentFeeName(extraFee.name) &&
      (extraFee.id === pair.first.id || extraFee.id === pair.second.id)
    ) {
      const prevOne = Number(extraFee.amount) || 0;
      if (Math.abs(body.amount - prevOne) > 0.001) {
        await db.extraFee.update({ where: { id: extraFee.id }, data: { amount: body.amount } });
        studentFeeDelta = body.amount - prevOne;
      }
    }

    const newBase = body.name !== undefined ? String(body.name).trim() : baseName;
    if (newBase && newBase !== baseName) {
      await updateInstallmentPairNames(db, pair.first.id, pair.second.id, newBase);
    }

    const first = await db.extraFee.findFirst({ where: { id: pair.first.id } });
    if (!first) throw new Error("Installment fee head not found after update");

    logExtraFeeInstallment("PATCH → updated existing pair (both installments)", {
      firstId: pair.first.id,
      secondId: pair.second.id,
      prevTotal,
      newTotal: combinedTotal ?? prevTotal,
      studentFeeDelta,
    });

    return {
      extraFee: first,
      extraFeeIds: [pair.first.id, pair.second.id],
      splitApplied: true,
      migrated: false,
      studentFeeDelta,
    };
  }

  if (shouldMigrateLumpToInstallmentsOnPatch(extraFee, wantsSplit)) {
    logExtraFeeInstallment("PATCH → will split single row into 2", {
      feeId: extraFee.id,
      feeName: extraFee.name,
      combinedTotal,
    });
    let lump = { ...extraFee };
    let studentFeeDelta = 0;
    if (combinedTotal !== null && combinedTotal !== extraFee.amount) {
      lump = { ...lump, amount: combinedTotal };
      studentFeeDelta = combinedTotal - extraFee.amount;
    }
    if (body.name !== undefined && String(body.name).trim()) {
      lump = { ...lump, name: String(body.name).trim() };
    }
    const migrated = await migrateUnsplitLumpExtraFee(db, { ...lump, splitIntoTwoInstallments: true }, {
      force: !isUnsplitLumpExtraFee(lump),
    });
    if (!migrated) {
      throw new Error("Could not split fee into two installments");
    }
    const first = await db.extraFee.findFirst({ where: { id: migrated.firstId } });
    if (!first) throw new Error("Installment fee head not found after split");

    logExtraFeeInstallment("PATCH → split complete (new 2 row IDs)", {
      oldLumpId: extraFee.id,
      firstId: migrated.firstId,
      secondId: migrated.secondId,
      studentFeeDelta,
    });

    return {
      extraFee: first,
      extraFeeIds: [migrated.firstId, migrated.secondId],
      splitApplied: true,
      migrated: true,
      studentFeeDelta,
    };
  }

  logExtraFeeInstallment("PATCH → single row update (no split)", {
    feeId: extraFee.id,
    wantsSplit,
    reason: wantsSplit
      ? "installment name or split not applicable"
      : "splitIntoTwoInstallments not requested",
  });

  const updates: Record<string, string | number | boolean> = {};
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (typeof body.amount === "number" && body.amount > 0) updates.amount = body.amount;
  if (body.splitIntoTwoInstallments !== undefined) {
    updates.splitIntoTwoInstallments = Boolean(body.splitIntoTwoInstallments);
  }

  if (Object.keys(updates).length === 0) {
    logExtraFeeInstallment("PATCH → no changes", { feeId: extraFee.id });
    return "no_changes";
  }

  const updated = await db.extraFee.update({ where: { id: extraFee.id }, data: updates });
  logExtraFeeInstallment("PATCH → single row saved", { feeId: extraFee.id, updates });
  const studentFeeDelta =
    typeof updates.amount === "number" ? (updates.amount as number) - extraFee.amount : 0;
  return {
    extraFee: updated,
    extraFeeIds: [extraFee.id],
    splitApplied: false,
    migrated: false,
    studentFeeDelta,
  };
}

/** Delete a lump row when 1st/2nd installment rows already exist; reassign payments to the pair. */
export async function deleteLumpKeepingInstallmentPair(
  db: Pick<typeof prisma, "$transaction" | "extraFee" | "paymentFeeAllocation">,
  lumpId: string,
  firstId: string,
  secondId: string,
  firstAmount: number
) {
  await db.$transaction(async (tx) => {
    await reassignAllocationsToInstallmentPair(tx, lumpId, firstId, secondId, firstAmount);
    await tx.extraFee.delete({ where: { id: lumpId } });
  });
}

/** Merge duplicate installment row allocations into the keeper, then delete the duplicate. */
export async function mergeDuplicateExtraFeeIntoKeeper(
  db: Pick<typeof prisma, "$transaction" | "extraFee" | "paymentFeeAllocation">,
  duplicateId: string,
  keeperId: string
) {
  await db.$transaction(async (tx) => {
    await tx.paymentFeeAllocation.updateMany({
      where: { extraFeeId: duplicateId, headType: "EXTRA_FEE" },
      data: { extraFeeId: keeperId },
    });
    await tx.extraFee.delete({ where: { id: duplicateId } });
  });
}

export async function migrateUnsplitLumpExtraFees(
  db: Pick<typeof prisma, "$transaction" | "extraFee" | "paymentFeeAllocation">,
  fees: Array<{
    id: string;
    schoolId: string;
    name: string;
    amount: number;
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string;
    splitIntoTwoInstallments: boolean;
  }>
) {
  for (const f of fees) {
    if (isUnsplitLumpExtraFee(f)) {
      await migrateUnsplitLumpExtraFee(db, f);
    }
  }
}

/** After editing one installment row, keep the sibling amount so the pair still sums correctly. */