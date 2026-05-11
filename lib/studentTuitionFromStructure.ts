import prisma from "@/lib/db";
import { extraFeeAppliesToStudentResidency } from "@/lib/extraFeeResidencyScope";

type ExtraFeeRow = {
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string | null;
};

type ComponentRow = { name: string; amount: number };

/** DB client slice used for tuition totals (works with `prisma` or a `$transaction` callback client). */
export type TuitionDb = Pick<typeof prisma, "classFeeStructure" | "extraFee">;

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
    extraTotal += ef.amount;
  }
  return extraTotal;
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
