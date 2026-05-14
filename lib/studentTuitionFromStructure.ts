import prisma from "@/lib/db";
import {
  extraFeeAppliesToStudentResidency,
  isStudentHosteller,
  normalizeExtraFeeResidencyScope,
} from "@/lib/extraFeeResidencyScope";

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

/** Official catalog row from Hostel and mess fees panel. */
function hasCanonicalSchoolHostel(extraFees: ExtraFeeRow[]): boolean {
  return extraFees.some(
    (ef) =>
      normName(ef.name) === "hostel fee" &&
      ef.targetType === "SCHOOL" &&
      normalizeExtraFeeResidencyScope(ef.residencyScope) === "HOSTELLER"
  );
}

function hasCanonicalClassMess(extraFees: ExtraFeeRow[], classId: string | null): boolean {
  if (!classId) return false;
  return extraFees.some(
    (ef) =>
      normName(ef.name) === "mess fee" && ef.targetType === "CLASS" && ef.targetClassId === classId
  );
}

/**
 * Legacy bulk extras often split hostel/mess into two heads (1st/2nd installment). When the canonical
 * "Hostel Fee" / "Mess Fee" catalog rows exist, those legacy rows would double-count with the new amounts.
 */
function isLegacyHostelInstallmentExtra(ef: ExtraFeeRow): boolean {
  const n = normName(ef.name);
  if (!n || n === "hostel fee" || n === "mess fee") return false;
  if (!n.includes("hostel")) return false;
  return nameLooksLikeSplitInstallment(n);
}

function isLegacyMessInstallmentExtra(ef: ExtraFeeRow): boolean {
  const n = normName(ef.name);
  if (!n || n === "mess fee" || n === "hostel fee") return false;
  if (!n.includes("mess")) return false;
  return nameLooksLikeSplitInstallment(n);
}

function nameLooksLikeSplitInstallment(n: string): boolean {
  return (
    n.includes("installment") ||
    n.includes("instalment") ||
    /\b1st\b/.test(n) ||
    /\b2nd\b/.test(n) ||
    n.includes("first installment") ||
    n.includes("second installment") ||
    (n.includes(" half") && (n.includes("1") || n.includes("2")))
  );
}

type ComponentRow = { name: string; amount: number };

/** DB client slice used for tuition totals (works with `prisma` or a `$transaction` callback client). */
export type TuitionDb = Pick<typeof prisma, "classFeeStructure" | "extraFee">;

function shouldOmitLegacySplitDuplicate(
  ef: ExtraFeeRow,
  allSchoolExtras: ExtraFeeRow[],
  opts: { classId: string | null; residencyType: string | null }
): boolean {
  const canonicalHostel = hasCanonicalSchoolHostel(allSchoolExtras);
  const canonicalMess = hasCanonicalClassMess(allSchoolExtras, opts.classId);
  const hosteller = isStudentHosteller(opts.residencyType);
  if (canonicalHostel && hosteller && isLegacyHostelInstallmentExtra(ef)) return true;
  if (canonicalMess && opts.classId && isLegacyMessInstallmentExtra(ef)) return true;
  return false;
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
    if (!extraFeeAppliesToStudentResidency(ef.residencyScope, opts.residencyType)) continue;
    if (shouldOmitLegacySplitDuplicate(ef, extraFees, opts)) continue;

    extraTotal += ef.amount;
  }
  return extraTotal;
}

/** For fee breakdown UI: drop legacy bulk hostel/mess installment heads when canonical catalog rows exist. */
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
  return shouldOmitLegacySplitDuplicate(ef as ExtraFeeRow, allSchoolExtras as ExtraFeeRow[], opts);
}

export async function sumClassBaseTuition(db: TuitionDb, classId: string | null): Promise<number> {
  if (!classId) return 0;
  const structure = await db.classFeeStructure.findUnique({
    where: { classId },
    select: { components: true },
  });
  const comps = (structure?.components as ComponentRow[] | null) ?? [];
  return comps.reduce((a, c) => a + (Number(c?.amount) || 0), 0);
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
  }
): Promise<{ base: number; extrasTotal: number; totalFee: number }> {
  const base = await sumClassBaseTuition(db, args.classId);
  const extraFees = await db.extraFee.findMany({
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
  });
  const extrasTotal = sumExtraFeesForStudent(extraFees, args);
  return { base, extrasTotal, totalFee: base + extrasTotal };
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

type FeeWriteDb = Pick<typeof prisma, "classFeeStructure" | "extraFee" | "studentFee" | "student">;

export async function upsertStudentFeeFromStructure(
  db: FeeWriteDb,
  params: {
    schoolId: string;
    studentId: string;
    classId: string | null;
    section: string | null;
    discountPercent: number;
    amountPaid: number;
  }
) {
  const studentRow = await db.student.findUnique({
    where: { id: params.studentId },
    select: { residencyType: true },
  });
  const residencyType = studentRow?.residencyType ?? "Day Scholar";

  const parts = await computeStudentTuitionParts(db, {
    schoolId: params.schoolId,
    classId: params.classId,
    section: params.section,
    studentId: params.studentId,
    residencyType,
  });
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
