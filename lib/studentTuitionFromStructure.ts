import prisma from "@/lib/db";

type ExtraFeeRow = {
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
};

type ComponentRow = { name: string; amount: number };

/** DB client slice used for tuition totals (works with `prisma` or a `$transaction` callback client). */
export type TuitionDb = Pick<typeof prisma, "classFeeStructure" | "extraFee">;

export function sumExtraFeesForStudent(
  extraFees: ExtraFeeRow[],
  opts: { classId: string | null; section: string | null; studentId: string | null }
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
    if (applies) extraTotal += ef.amount;
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
export async function computeStudentTuitionTotalFee(
  db: TuitionDb,
  args: {
    schoolId: string;
    classId: string | null;
    section: string | null;
    studentId: string | null;
  }
): Promise<number> {
  const base = await sumClassBaseTuition(db, args.classId);
  const extraFees = await db.extraFee.findMany({
    where: { schoolId: args.schoolId },
    select: {
      amount: true,
      targetType: true,
      targetClassId: true,
      targetSection: true,
      targetStudentId: true,
    },
  });
  return base + sumExtraFeesForStudent(extraFees, args);
}

export function finalFeeFromTotalAndDiscount(totalFee: number, discountPercent: number): number {
  const d = Math.min(100, Math.max(0, discountPercent || 0)) / 100;
  return Math.round(totalFee * (1 - d) * 100) / 100;
}

type FeeWriteDb = Pick<typeof prisma, "classFeeStructure" | "extraFee" | "studentFee">;

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
  const totalFee = await computeStudentTuitionTotalFee(db, {
    schoolId: params.schoolId,
    classId: params.classId,
    section: params.section,
    studentId: params.studentId,
  });
  const finalFee = finalFeeFromTotalAndDiscount(totalFee, params.discountPercent);
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
