import prisma from "@/lib/db";
import { extraFeeAppliesToStudent, normalizeExtraFeeResidencyScope } from "@/lib/extraFeeResidencyScope";
import {
  baseNameFromInstallmentFee,
  installmentIndexFromName,
  isInstallmentFeeName,
} from "@/lib/extraFeeInstallments";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";

export type ExtraFeeRow = {
  name?: string | null;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string | null;
};

function normName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

/** Same target scope (school/class/section/student + residency). */
function sameExtraScope(a: ExtraFeeRow, b: ExtraFeeRow): boolean {
  return (
    a.targetType === b.targetType &&
    a.targetClassId === b.targetClassId &&
    a.targetSection === b.targetSection &&
    a.targetStudentId === b.targetStudentId &&
    normalizeExtraFeeResidencyScope(a.residencyScope) === normalizeExtraFeeResidencyScope(b.residencyScope)
  );
}

/**
 * Legacy imports sometimes added installment-named rows while a lump base row still exists.
 * Omit installment duplicates when a non-installment row with the same base name exists in the same scope.
 */
function isLegacyInstallmentDuplicate(ef: ExtraFeeRow, allSchoolExtras: ExtraFeeRow[]): boolean {
  if (!isInstallmentFeeName(ef.name)) return false;
  const baseNorm = normName(baseNameFromInstallmentFee(ef.name ?? ""));
  if (!baseNorm) return false;
  return allSchoolExtras.some(
    (other) =>
      other !== ef &&
      sameExtraScope(ef, other) &&
      !isInstallmentFeeName(other.name) &&
      normName(other.name) === baseNorm
  );
}

type ComponentRow = { name: string; amount: number };

/** DB client slice used for tuition totals (works with `prisma` or a `$transaction` callback client). */
export type TuitionDb = Pick<typeof prisma, "classFeeStructure" | "extraFee" | "class">;

/** Preloaded rows for bulk recalculate — same totals, far fewer queries. */
export type TuitionBulkCache = {
  extraFees: ExtraFeeRow[];
  baseByClassId: Map<string, number>;
};

function baseFromStructureComponents(components: ComponentRow[] | null | undefined): number {
  return (components ?? []).reduce((a, c) => a + (Number(c?.amount) || 0), 0);
}

/** Full lump row when 1st + 2nd installment rows already exist for the same fee (same scope). */
function isLegacyLumpWhenInstallmentPairExists(
  ef: ExtraFeeRow,
  allSchoolExtras: ExtraFeeRow[]
): boolean {
  if (isInstallmentFeeName(ef.name)) return false;
  const baseNorm = normName(ef.name);
  if (!baseNorm) return false;
  let hasFirst = false;
  let hasSecond = false;
  for (const other of allSchoolExtras) {
    if (other === ef) continue;
    if (!sameExtraScope(ef, other)) continue;
    const idx = installmentIndexFromName(other.name);
    if (!idx) continue;
    if (normName(baseNameFromInstallmentFee(other.name ?? "")) !== baseNorm) continue;
    if (idx === 1) hasFirst = true;
    if (idx === 2) hasSecond = true;
  }
  return hasFirst && hasSecond;
}

function shouldOmitLegacySplitDuplicate(
  ef: ExtraFeeRow,
  allSchoolExtras: ExtraFeeRow[]
): boolean {
  return (
    isLegacyInstallmentDuplicate(ef, allSchoolExtras) ||
    isLegacyLumpWhenInstallmentPairExists(ef, allSchoolExtras)
  );
}

export function sumExtraFeesForStudent(
  extraFees: ExtraFeeRow[],
  opts: {
    classId: string | null;
    section: string | null;
    studentId: string | null;
    residencyType: string | null;
  }
): number {
  let extraTotal = 0;
  for (const ef of extraFees) {
    const applies =
      ef.targetType === "SCHOOL" ||
      (ef.targetType === "CLASS" && ef.targetClassId === opts.classId) ||
      (ef.targetType === "SECTION" &&
        ef.targetClassId === opts.classId &&
        ef.targetSection === opts.section) ||
      (ef.targetType === "STUDENT" &&
        opts.studentId &&
        ef.targetStudentId === opts.studentId);
    if (!applies) continue;
    if (!extraFeeAppliesToStudent({ name: ef.name, residencyScope: ef.residencyScope }, opts.residencyType))
      continue;
    if (shouldOmitLegacySplitDuplicate(ef, extraFees)) continue;
    if (isStudentRte(opts.residencyType) && isTuitionNamedExtraFee(ef.name)) continue;

    extraTotal += ef.amount;
  }
  return extraTotal;
}

/** For fee breakdown UI: drop legacy installment duplicates when a lump base row exists in the same scope. */
export function shouldOmitLegacySplitHostelMessExtraForBreakdown<
  T extends {
    name: string;
    amount: number;
    targetType: string;
    targetClassId: string | null;
    targetSection: string | null;
    targetStudentId: string | null;
    residencyScope: string | null;
  }
>(
  ef: T,
  allSchoolExtras: T[],
  opts: { classId: string | null; residencyType: string | null }
): boolean {
  return shouldOmitLegacySplitDuplicate(ef as ExtraFeeRow, allSchoolExtras as ExtraFeeRow[]);
}

export async function sumClassBaseTuition(db: TuitionDb, classId: string | null): Promise<number> {
  if (!classId) return 0;
  const structure = await db.classFeeStructure.findUnique({
    where: { classId },
    select: { components: true },
  });
  const direct = baseFromStructureComponents(structure?.components as ComponentRow[] | null);
  if (direct > 0) return direct;

  /** Same class name, different section (e.g. LKG-A borrows from UKG or CLASS 8-B from 8-A). */
  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { name: true, schoolId: true },
  });
  if (!cls) return 0;

  const nameKey = cls.name.trim().toLowerCase().replace(/\s+/g, " ");
  const siblings = await db.class.findMany({
    where: { schoolId: cls.schoolId, id: { not: classId } },
    select: { id: true, name: true },
  });
  const siblingIds = siblings
    .filter((s) => s.name.trim().toLowerCase().replace(/\s+/g, " ") === nameKey)
    .map((s) => s.id);
  if (siblingIds.length === 0) return 0;

  const donor = await db.classFeeStructure.findFirst({
    where: { classId: { in: siblingIds } },
    select: { components: true },
  });
  return baseFromStructureComponents(donor?.components as ComponentRow[] | null);
}

/** One query for all class bases — used by bulk fee recalculate only. */
export async function buildTuitionBulkCache(
  db: TuitionDb,
  schoolId: string,
  classIds: ReadonlyArray<string | null | undefined>
): Promise<TuitionBulkCache> {
  const extraFees = await db.extraFee.findMany({
    where: { schoolId },
    select: {
      name: true,
      amount: true,
      targetType: true,
      targetClassId: true,
      targetSection: true,
      targetStudentId: true,
      residencyScope: true,
    },
  });

  const uniqueClassIds = [...new Set(classIds.filter((id): id is string => Boolean(id)))];
  const baseByClassId = new Map<string, number>();
  if (uniqueClassIds.length > 0) {
    const structures = await db.classFeeStructure.findMany({
      where: { classId: { in: uniqueClassIds } },
      select: { classId: true, components: true },
    });
    const componentsByClassId = new Map<string, ComponentRow[]>();
    for (const row of structures) {
      componentsByClassId.set(
        row.classId,
        (row.components as ComponentRow[] | null) ?? []
      );
    }
    const classMeta = await db.class.findMany({
      where: { id: { in: uniqueClassIds } },
      select: { id: true, name: true, section: true },
    });
    const { fillMissingClassFeeStructuresFromSiblings } = await import(
      "@/lib/feeDueReportCompute"
    );
    fillMissingClassFeeStructuresFromSiblings(componentsByClassId, classMeta);
    for (const [classId, comps] of componentsByClassId) {
      baseByClassId.set(classId, baseFromStructureComponents(comps));
    }
  }

  return { extraFees, baseByClassId };
}

/**
 * Tuition total (before discount) from global class fee structure plus applicable extra fees.
 * Matches the rules used when saving a class fee structure in `/api/fees/structure`.
 */
export async function computeStudentTuitionParts(
  db: TuitionDb,
  args: {
    schoolId: string;
    classId: string | null;
    section: string | null;
    studentId: string | null;
    residencyType: string | null;
  },
  cache?: TuitionBulkCache
): Promise<{ base: number; extrasTotal: number; totalFee: number }> {
  let base = 0;
  if (args.classId) {
    if (cache?.baseByClassId.has(args.classId)) {
      base = cache.baseByClassId.get(args.classId) ?? 0;
    } else {
      base = await sumClassBaseTuition(db, args.classId);
      cache?.baseByClassId.set(args.classId, base);
    }
  }
  if (isStudentRte(args.residencyType)) base = 0;

  const extraFees =
    cache?.extraFees ??
    (await db.extraFee.findMany({
      where: { schoolId: args.schoolId },
      select: {
        name: true,
        amount: true,
        targetType: true,
        targetClassId: true,
        targetSection: true,
        targetStudentId: true,
        residencyScope: true,
      },
    }));

  const extrasTotal = sumExtraFeesForStudent(extraFees, args);
  return { base, extrasTotal, totalFee: base + extrasTotal };
}

/** In-memory tuition parts when {@link TuitionBulkCache} is already loaded (bulk recalculate). */
export function computeStudentTuitionPartsSync(
  args: {
    classId: string | null;
    section: string | null;
    studentId: string | null;
    residencyType: string | null;
  },
  cache: TuitionBulkCache
): { base: number; extrasTotal: number; totalFee: number } {
  let base = args.classId ? (cache.baseByClassId.get(args.classId) ?? 0) : 0;
  if (isStudentRte(args.residencyType)) base = 0;
  const extrasTotal = sumExtraFeesForStudent(cache.extraFees, args);
  return { base, extrasTotal, totalFee: base + extrasTotal };
}

export type StudentFeeRecalcPayload = {
  studentId: string;
  totalFee: number;
  discountPercent: number;
  finalFee: number;
  amountPaid: number;
  remainingFee: number;
};

/** Same numbers as {@link upsertStudentFeeFromStructure}, without a DB round-trip. */
export function buildStudentFeeRecalcPayload(
  student: {
    id: string;
    classId: string | null;
    section: string | null;
    residencyType: string | null;
    discountPercent: number;
    amountPaid: number;
  },
  cache: TuitionBulkCache
): StudentFeeRecalcPayload {
  const parts = computeStudentTuitionPartsSync(
    {
      classId: student.classId,
      section: student.section,
      studentId: student.id,
      residencyType: student.residencyType,
    },
    cache
  );
  const discountPercent = student.discountPercent;
  const finalFee = finalFeeFromStructureAndExtras(parts.base, parts.extrasTotal, discountPercent);
  const amountPaid = student.amountPaid;
  return {
    studentId: student.id,
    totalFee: parts.totalFee,
    discountPercent,
    finalFee,
    amountPaid,
    remainingFee: Math.max(0, Math.round((finalFee - amountPaid) * 100) / 100),
  };
}

export async function computeStudentTuitionTotalFee(
  db: TuitionDb,
  args: {
    schoolId: string;
    classId: string | null;
    section: string | null;
    studentId: string | null;
    residencyType: string | null;
  }
): Promise<number> {
  const p = await computeStudentTuitionParts(db, args);
  return p.totalFee;
}

/** Multiplier applied to class fee structure only (student discount %). */
export function structureMultiplierAfterDiscount(discountPercent: number): number {
  return 1 - Math.min(100, Math.max(0, discountPercent || 0)) / 100;
}

/**
 * Amount the student must pay: discounted class structure + extra fees at full face value
 * (extras are not reduced by the student discount %).
 */
export function finalFeeFromStructureAndExtras(
  structurePreDiscountTotal: number,
  extraFeesTotal: number,
  discountPercent: number
): number {
  return structurePreDiscountTotal * structureMultiplierAfterDiscount(discountPercent) + extraFeesTotal;
}

/** @deprecated Prefer {@link finalFeeFromStructureAndExtras} when extras exist; kept for all-or-nothing discount on one lump. */
export function finalFeeFromTotalAndDiscount(totalFee: number, discountPercent: number): number {
  return finalFeeFromStructureAndExtras(totalFee, 0, discountPercent);
}

type FeeWriteDb = Pick<typeof prisma, "classFeeStructure" | "extraFee" | "studentFee" | "student" | "class">;

export async function upsertStudentFeeFromStructure(
  db: FeeWriteDb,
  params: {
    schoolId: string;
    studentId: string;
    classId: string | null;
    section: string | null;
    discountPercent: number;
    amountPaid: number;
    /** Skip per-student Student lookup when bulk recalculating. */
    residencyType?: string | null;
  },
  cache?: TuitionBulkCache
) {
  let residencyType = params.residencyType ?? null;
  if (residencyType == null) {
    const studentRow = await db.student.findUnique({
      where: { id: params.studentId },
      select: { residencyType: true },
    });
    residencyType = studentRow?.residencyType ?? "Day Scholar";
  }

  const parts = await computeStudentTuitionParts(
    db,
    {
      schoolId: params.schoolId,
      classId: params.classId,
      section: params.section,
      studentId: params.studentId,
      residencyType,
    },
    cache
  );
  const totalFee = parts.totalFee;
  const finalFee = finalFeeFromStructureAndExtras(parts.base, parts.extrasTotal, params.discountPercent);
  const remainingFee = Math.max(0, finalFee - params.amountPaid);

  await db.studentFee.upsert({
    where: { studentId: params.studentId },
    create: {
      studentId: params.studentId,
      totalFee,
      discountPercent: params.discountPercent,
      finalFee,
      amountPaid: params.amountPaid,
      remainingFee,
    },
    update: {
      totalFee,
      discountPercent: params.discountPercent,
      finalFee,
      remainingFee,
    },
  });
}
