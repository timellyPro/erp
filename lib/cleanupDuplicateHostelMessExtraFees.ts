import prisma from "@/lib/db";
import {
  buildInstallmentFeeNames,
  canonicalExtraFeeBaseName,
  installmentIndexFromName,
  isInstallmentFeeName,
  isUnsplitLumpExtraFee,
} from "@/lib/extraFeeInstallments";
import {
  deleteLumpKeepingInstallmentPair,
  mergeDuplicateExtraFeeIntoKeeper,
  migrateUnsplitLumpExtraFee,
  updateInstallmentPairNames,
} from "@/lib/extraFeeInstallmentDb";
import {
  isHostelCategoryExtraFeeName,
  isMessCategoryExtraFeeName,
  normalizeExtraFeeResidencyScope,
} from "@/lib/extraFeeResidencyScope";

export type HostelMessCleanupRow = {
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
};

type CleanupDb = Pick<typeof prisma, "$transaction" | "extraFee" | "paymentFeeAllocation">;

function normName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function scopeKey(r: HostelMessCleanupRow): string {
  return [
    r.targetType,
    r.targetClassId ?? "",
    r.targetSection ?? "",
    r.targetStudentId ?? "",
    normalizeExtraFeeResidencyScope(r.residencyScope),
  ].join("|");
}

function targetBreadth(r: HostelMessCleanupRow): number {
  switch (r.targetType) {
    case "STUDENT":
      return 4;
    case "SECTION":
      return 3;
    case "CLASS":
      return 2;
    case "SCHOOL":
      return 1;
    default:
      return 0;
  }
}

function targetPriority(r: HostelMessCleanupRow): number {
  return targetBreadth(r);
}

function amountsClose(a: number, b: number): boolean {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.02;
}

function pickBestInstallment(
  rows: HostelMessCleanupRow[],
  index: 1 | 2,
  canonicalBase: string
): HostelMessCleanupRow | null {
  const candidates = rows.filter((r) => installmentIndexFromName(r.name) === index);
  if (candidates.length === 0) return null;

  const [expected1, expected2] = buildInstallmentFeeNames(canonicalBase);
  const expectedNorm = normName(index === 1 ? expected1 : expected2);
  const baseNorm = normName(canonicalBase);

  const score = (r: HostelMessCleanupRow) => {
    let s = targetPriority(r) * 10;
    if (normName(r.name) === expectedNorm) s += 1000;
    if (normName(canonicalExtraFeeBaseName(r.name)) === baseNorm) s += 100;
    return s;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0] ?? null;
}

async function cleanupScopeGroup(
  db: CleanupDb,
  fees: HostelMessCleanupRow[],
  canonicalBase: string
): Promise<boolean> {
  let changed = false;
  const lumps = fees.filter((f) => !isInstallmentFeeName(f.name));
  const inst1Rows = fees.filter((f) => installmentIndexFromName(f.name) === 1);
  const inst2Rows = fees.filter((f) => installmentIndexFromName(f.name) === 2);

  const keeper1 = pickBestInstallment(inst1Rows, 1, canonicalBase);
  const keeper2 = pickBestInstallment(inst2Rows, 2, canonicalBase);

  if (keeper1 && keeper2) {
    const [n1, n2] = buildInstallmentFeeNames(canonicalBase);
    const namesNeedFix =
      normName(keeper1.name) !== normName(n1) || normName(keeper2.name) !== normName(n2);
    if (namesNeedFix) {
      await updateInstallmentPairNames(db, keeper1.id, keeper2.id, canonicalBase);
      changed = true;
    }

    for (const lump of lumps) {
      await deleteLumpKeepingInstallmentPair(
        db,
        lump.id,
        keeper1.id,
        keeper2.id,
        Number(keeper1.amount) || 0
      );
      changed = true;
    }

    for (const dup of inst1Rows.filter((r) => r.id !== keeper1.id)) {
      await mergeDuplicateExtraFeeIntoKeeper(db, dup.id, keeper1.id);
      changed = true;
    }
    for (const dup of inst2Rows.filter((r) => r.id !== keeper2.id)) {
      await mergeDuplicateExtraFeeIntoKeeper(db, dup.id, keeper2.id);
      changed = true;
    }

    return changed;
  }

  if (lumps.length === 1 && isUnsplitLumpExtraFee(lumps[0])) {
    const migrated = await migrateUnsplitLumpExtraFee(db, lumps[0]);
    return migrated !== null;
  }

  return false;
}

async function cleanupCrossScopeLumps(
  db: CleanupDb,
  fees: HostelMessCleanupRow[]
): Promise<boolean> {
  let changed = false;
  const byBaseResidency = new Map<string, HostelMessCleanupRow[]>();

  for (const f of fees) {
    const key = `${normName(canonicalExtraFeeBaseName(f.name))}|${normalizeExtraFeeResidencyScope(f.residencyScope)}`;
    const list = byBaseResidency.get(key) ?? [];
    list.push(f);
    byBaseResidency.set(key, list);
  }

  for (const group of byBaseResidency.values()) {
    const canonicalBase = canonicalExtraFeeBaseName(group[0]?.name ?? "");
    if (!canonicalBase) continue;

    const lumps = group.filter((f) => !isInstallmentFeeName(f.name));
    if (lumps.length === 0) continue;

    const byScope = new Map<string, HostelMessCleanupRow[]>();
    for (const f of group) {
      const sk = scopeKey(f);
      const list = byScope.get(sk) ?? [];
      list.push(f);
      byScope.set(sk, list);
    }

    const pairs: Array<{ first: HostelMessCleanupRow; second: HostelMessCleanupRow; total: number }> =
      [];
    for (const scopeFees of byScope.values()) {
      const k1 = pickBestInstallment(scopeFees, 1, canonicalBase);
      const k2 = pickBestInstallment(scopeFees, 2, canonicalBase);
      if (!k1 || !k2) continue;
      pairs.push({
        first: k1,
        second: k2,
        total: (Number(k1.amount) || 0) + (Number(k2.amount) || 0),
      });
    }

    for (const lump of lumps) {
      const lumpAmount = Number(lump.amount) || 0;
      const lumpBreadth = targetBreadth(lump);
      const matching = pairs.filter(
        (p) =>
          targetBreadth(p.first) > lumpBreadth &&
          amountsClose(lumpAmount, p.total)
      );
      if (matching.length !== 1) continue;
      const { first, second } = matching[0]!;
      await deleteLumpKeepingInstallmentPair(
        db,
        lump.id,
        first.id,
        second.id,
        Number(first.amount) || 0
      );
      changed = true;
    }
  }

  return changed;
}

const hostelMessSelect = {
  id: true,
  schoolId: true,
  name: true,
  amount: true,
  targetType: true,
  targetClassId: true,
  targetSection: true,
  targetStudentId: true,
  residencyScope: true,
  splitIntoTwoInstallments: true,
} as const;

function scopeGroupNeedsCleanup(fees: HostelMessCleanupRow[], canonicalBase: string): boolean {
  const lumps = fees.filter((f) => !isInstallmentFeeName(f.name));
  const inst1Rows = fees.filter((f) => installmentIndexFromName(f.name) === 1);
  const inst2Rows = fees.filter((f) => installmentIndexFromName(f.name) === 2);
  const keeper1 = pickBestInstallment(inst1Rows, 1, canonicalBase);
  const keeper2 = pickBestInstallment(inst2Rows, 2, canonicalBase);

  if (keeper1 && keeper2) {
    const [n1, n2] = buildInstallmentFeeNames(canonicalBase);
    if (normName(keeper1.name) !== normName(n1) || normName(keeper2.name) !== normName(n2)) return true;
    if (lumps.length > 0) return true;
    if (inst1Rows.length > 1 || inst2Rows.length > 1) return true;
    return false;
  }

  if (lumps.length === 1 && isUnsplitLumpExtraFee(lumps[0])) return true;
  return false;
}

function crossScopeNeedsCleanup(fees: HostelMessCleanupRow[]): boolean {
  const byBaseResidency = new Map<string, HostelMessCleanupRow[]>();
  for (const f of fees) {
    const key = `${normName(canonicalExtraFeeBaseName(f.name))}|${normalizeExtraFeeResidencyScope(f.residencyScope)}`;
    const list = byBaseResidency.get(key) ?? [];
    list.push(f);
    byBaseResidency.set(key, list);
  }

  for (const group of byBaseResidency.values()) {
    const canonicalBase = canonicalExtraFeeBaseName(group[0]?.name ?? "");
    if (!canonicalBase) continue;
    const lumps = group.filter((f) => !isInstallmentFeeName(f.name));
    if (lumps.length === 0) continue;

    const byScope = new Map<string, HostelMessCleanupRow[]>();
    for (const f of group) {
      const sk = scopeKey(f);
      const list = byScope.get(sk) ?? [];
      list.push(f);
      byScope.set(sk, list);
    }

    const pairs: Array<{ first: HostelMessCleanupRow; second: HostelMessCleanupRow; total: number }> =
      [];
    for (const scopeFees of byScope.values()) {
      const k1 = pickBestInstallment(scopeFees, 1, canonicalBase);
      const k2 = pickBestInstallment(scopeFees, 2, canonicalBase);
      if (!k1 || !k2) continue;
      pairs.push({
        first: k1,
        second: k2,
        total: (Number(k1.amount) || 0) + (Number(k2.amount) || 0),
      });
    }

    for (const lump of lumps) {
      const lumpAmount = Number(lump.amount) || 0;
      const lumpBreadth = targetBreadth(lump);
      const matching = pairs.filter(
        (p) => targetBreadth(p.first) > lumpBreadth && amountsClose(lumpAmount, p.total)
      );
      if (matching.length === 1) return true;
    }
  }
  return false;
}

async function fetchHostelMessRows(
  db: Pick<typeof prisma, "extraFee">,
  schoolId: string
): Promise<HostelMessCleanupRow[]> {
  const all = await db.extraFee.findMany({
    where: { schoolId },
    select: hostelMessSelect,
  });
  return all.filter(
    (f) => isHostelCategoryExtraFeeName(f.name) || isMessCategoryExtraFeeName(f.name)
  );
}

/**
 * Permanently remove duplicate hostel/mess extra fees: legacy lumps when installment
 * pairs exist, garbled duplicate installment rows, and cross-scope lumps (e.g. school
 * lump + class installment pair with the same total).
 */
export async function cleanupDuplicateHostelMessExtraFees(
  db: CleanupDb & Pick<typeof prisma, "extraFee" | "student">,
  schoolId: string
): Promise<boolean> {
  const rows = await fetchHostelMessRows(db, schoolId);
  if (rows.length === 0) return false;

  const scopeGroups = new Map<string, HostelMessCleanupRow[]>();
  for (const f of rows) {
    const category = isHostelCategoryExtraFeeName(f.name) ? "hostel" : "mess";
    const key = `${category}|${scopeKey(f)}|${normName(canonicalExtraFeeBaseName(f.name))}`;
    const list = scopeGroups.get(key) ?? [];
    list.push(f);
    scopeGroups.set(key, list);
  }

  let needsWork = crossScopeNeedsCleanup(rows);
  if (!needsWork) {
    for (const [, group] of scopeGroups) {
      const base = canonicalExtraFeeBaseName(group[0]?.name ?? "");
      if (base && scopeGroupNeedsCleanup(group, base)) {
        needsWork = true;
        break;
      }
    }
  }
  if (!needsWork) return false;

  let changed = false;

  for (const [, group] of scopeGroups) {
    const base = canonicalExtraFeeBaseName(group[0]?.name ?? "");
    if (!base) continue;
    if (!scopeGroupNeedsCleanup(group, base)) continue;
    if (await cleanupScopeGroup(db, group, base)) changed = true;
  }

  const rowsAfter = await fetchHostelMessRows(db, schoolId);
  if (crossScopeNeedsCleanup(rowsAfter) && (await cleanupCrossScopeLumps(db, rowsAfter))) {
    changed = true;
  }

  if ((await removeStudentScopedHostelWhenSchoolWideExists(db, schoolId)) > 0) {
    changed = true;
  }
  if ((await removeStudentScopedMessWhenClassMessExists(db, schoolId)) > 0) {
    changed = true;
  }

  return changed;
}

/**
 * Create the missing 1st or 2nd hostel/mess installment when only one half exists for a scope.
 */
export async function repairIncompleteHostelMessInstallmentPairs(
  db: Pick<typeof prisma, "extraFee">,
  schoolId: string
): Promise<number> {
  const rows = await fetchHostelMessRows(db, schoolId);
  if (rows.length === 0) return 0;

  const scopeGroups = new Map<string, HostelMessCleanupRow[]>();
  for (const f of rows) {
    const category = isHostelCategoryExtraFeeName(f.name) ? "hostel" : "mess";
    const key = `${category}|${scopeKey(f)}|${normName(canonicalExtraFeeBaseName(f.name))}`;
    const list = scopeGroups.get(key) ?? [];
    list.push(f);
    scopeGroups.set(key, list);
  }

  let repaired = 0;
  for (const [, group] of scopeGroups) {
    const base = canonicalExtraFeeBaseName(group[0]?.name ?? "");
    if (!base) continue;

    const inst1Rows = group.filter((f) => installmentIndexFromName(f.name) === 1);
    const inst2Rows = group.filter((f) => installmentIndexFromName(f.name) === 2);
    const keeper1 = pickBestInstallment(inst1Rows, 1, base);
    const keeper2 = pickBestInstallment(inst2Rows, 2, base);
    if (keeper1 && keeper2) continue;

    const template = keeper1 ?? keeper2;
    if (!template) continue;

    const missingIndex: 1 | 2 = keeper1 ? 2 : 1;
    const [n1, n2] = buildInstallmentFeeNames(base);
    const name = missingIndex === 1 ? n1 : n2;
    const amount = Number(template.amount) || 0;
    if (amount <= 0) continue;

    await db.extraFee.create({
      data: {
        schoolId: template.schoolId,
        name,
        amount,
        targetType: template.targetType,
        targetClassId: template.targetClassId,
        targetSection: template.targetSection,
        targetStudentId: template.targetStudentId,
        residencyScope: template.residencyScope,
        splitIntoTwoInstallments: false,
      },
    });
    repaired += 1;
  }

  return repaired;
}

/**
 * When a school-wide hostel installment pair exists, per-student hostel rows are duplicates
 * (accidental bulk assign on top of school-wide). Merge allocations into the school pair and delete.
 */
export async function removeStudentScopedHostelWhenSchoolWideExists(
  db: CleanupDb & Pick<typeof prisma, "extraFee">,
  schoolId: string
): Promise<number> {
  const rows = await fetchHostelMessRows(db, schoolId);
  const schoolHostel = rows.filter(
    (f) => f.targetType === "SCHOOL" && isHostelCategoryExtraFeeName(f.name)
  );
  const canonicalBase = canonicalExtraFeeBaseName(schoolHostel[0]?.name ?? "Hostel Fee") || "Hostel Fee";
  const keeper1 = pickBestInstallment(schoolHostel, 1, canonicalBase);
  const keeper2 = pickBestInstallment(schoolHostel, 2, canonicalBase);
  if (!keeper1 || !keeper2) return 0;

  const studentHostel = rows.filter(
    (f) => f.targetType === "STUDENT" && isHostelCategoryExtraFeeName(f.name)
  );
  if (studentHostel.length === 0) return 0;

  let removed = 0;
  for (const dup of studentHostel) {
    const idx = installmentIndexFromName(dup.name);
    const keeperId = idx === 2 ? keeper2.id : keeper1.id;
    await mergeDuplicateExtraFeeIntoKeeper(db, dup.id, keeperId);
    removed += 1;
  }
  return removed;
}

/**
 * Per-student mess rows from bulk import duplicate class-level mess (admission / fee structure).
 * Merge payments into the class installment pair when possible, then delete the student row.
 */
export async function removeStudentScopedMessWhenClassMessExists(
  db: CleanupDb & Pick<typeof prisma, "extraFee" | "student">,
  schoolId: string
): Promise<number> {
  const rows = (await fetchHostelMessRows(db, schoolId)).filter((f) => isMessCategoryExtraFeeName(f.name));

  const classIdsWithMess = new Set<string>();
  const classMessByClassId = new Map<string, HostelMessCleanupRow[]>();
  for (const f of rows) {
    if (f.targetType === "CLASS" && f.targetClassId) {
      classIdsWithMess.add(f.targetClassId);
      const list = classMessByClassId.get(f.targetClassId) ?? [];
      list.push(f);
      classMessByClassId.set(f.targetClassId, list);
    }
  }
  if (classIdsWithMess.size === 0) return 0;

  const studentMess = rows.filter((f) => f.targetType === "STUDENT" && f.targetStudentId);
  if (studentMess.length === 0) return 0;

  const students = await db.student.findMany({
    where: { schoolId, classId: { in: [...classIdsWithMess] } },
    select: { id: true, classId: true },
  });
  const classIdByStudent = new Map(
    students.filter((s) => s.classId).map((s) => [s.id, s.classId as string])
  );

  let removed = 0;
  for (const dup of studentMess) {
    const studentId = dup.targetStudentId;
    if (!studentId) continue;
    const classId = classIdByStudent.get(studentId);
    if (!classId || !classIdsWithMess.has(classId)) continue;

    const classMess = classMessByClassId.get(classId) ?? [];
    const canonicalBase = canonicalExtraFeeBaseName(dup.name) || "Mess Fee";
    const idx = installmentIndexFromName(dup.name);

    if (idx) {
      const keeper = pickBestInstallment(classMess, idx, canonicalBase);
      if (keeper) {
        await mergeDuplicateExtraFeeIntoKeeper(db, dup.id, keeper.id);
        removed += 1;
        continue;
      }
    }

    const keeper1 = pickBestInstallment(classMess, 1, canonicalBase);
    const keeper2 = pickBestInstallment(classMess, 2, canonicalBase);
    if (!idx && keeper1 && keeper2 && isUnsplitLumpExtraFee(dup)) {
      await deleteLumpKeepingInstallmentPair(
        db,
        dup.id,
        keeper1.id,
        keeper2.id,
        Number(keeper1.amount) || 0
      );
      removed += 1;
      continue;
    }

    const fallbackKeeper = keeper1 ?? keeper2 ?? classMess[0];
    if (fallbackKeeper) {
      await mergeDuplicateExtraFeeIntoKeeper(db, dup.id, fallbackKeeper.id);
      removed += 1;
    }
  }
  return removed;
}

/** Rows that {@link removeStudentScopedMessWhenClassMessExists} would remove. */
export async function countStudentScopedMessWhenClassMessExists(
  db: Pick<typeof prisma, "extraFee" | "student">,
  schoolId: string
): Promise<number> {
  const rows = (await fetchHostelMessRows(db, schoolId)).filter((f) => isMessCategoryExtraFeeName(f.name));
  const classIdsWithMess = new Set(
    rows.filter((f) => f.targetType === "CLASS" && f.targetClassId).map((f) => f.targetClassId as string)
  );
  if (classIdsWithMess.size === 0) return 0;

  const students = await db.student.findMany({
    where: { schoolId, classId: { in: [...classIdsWithMess] } },
    select: { id: true },
  });
  const studentIds = new Set(students.map((s) => s.id));
  return rows.filter(
    (f) => f.targetType === "STUDENT" && f.targetStudentId && studentIds.has(f.targetStudentId)
  ).length;
}

/** Count per-student hostel rows that would be removed when school-wide pair exists. */
export async function countStudentScopedHostelWhenSchoolWideExists(
  db: Pick<typeof prisma, "extraFee">,
  schoolId: string
): Promise<number> {
  const rows = await fetchHostelMessRows(db, schoolId);
  const schoolHostel = rows.filter(
    (f) => f.targetType === "SCHOOL" && isHostelCategoryExtraFeeName(f.name)
  );
  const canonicalBase = canonicalExtraFeeBaseName(schoolHostel[0]?.name ?? "Hostel Fee") || "Hostel Fee";
  const keeper1 = pickBestInstallment(schoolHostel, 1, canonicalBase);
  const keeper2 = pickBestInstallment(schoolHostel, 2, canonicalBase);
  if (!keeper1 || !keeper2) return 0;
  return rows.filter((f) => f.targetType === "STUDENT" && isHostelCategoryExtraFeeName(f.name)).length;
}
