import prisma from "@/lib/db";
import {
  computeStudentTuitionParts,
  finalFeeFromStructureAndExtras,
} from "@/lib/studentTuitionFromStructure";

export type FeeStructureComponent = { name: string; amount: number };

function normalizeComponents(raw: unknown[]): FeeStructureComponent[] {
  return raw
    .map((c: unknown) => {
      const component = c as { name?: unknown; amount?: unknown };
      const name = typeof component.name === "string" ? component.name.trim() : "";
      const rawAmount = component.amount;
      const amount =
        typeof rawAmount === "number" ? rawAmount : rawAmount != null ? Number(rawAmount) : NaN;
      return { name, amount };
    })
    .filter((c) => c.name.length > 0 && Number.isFinite(c.amount));
}

/**
 * Upserts the global fee structure for a class and recalculates all student fee rows
 * in that class (same behavior as PUT /api/fees/structure).
 */
export async function saveClassFeeStructureAndSyncStudents(args: {
  schoolId: string;
  classId: string;
  components: unknown[];
}) {
  const normalizedComponents = normalizeComponents(args.components as unknown[]);
  if (normalizedComponents.length === 0) {
    throw new Error("Each component must have name and a valid numeric amount");
  }

  const structure = await prisma.classFeeStructure.upsert({
    where: { classId: args.classId },
    create: {
      schoolId: args.schoolId,
      classId: args.classId,
      components: normalizedComponents as object[],
    },
    update: { components: normalizedComponents as object[] },
    include: { class: { select: { id: true, name: true, section: true } } },
  });

  const students = await prisma.student.findMany({
    where: { classId: args.classId, schoolId: args.schoolId },
    include: {
      class: { select: { section: true } },
      fee: true,
    },
  });

  const chunkSize = 8;
  for (let i = 0; i < students.length; i += chunkSize) {
    const chunk = students.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (student) => {
        const fee = student.fee;
        if (!fee) return;

        const parts = await computeStudentTuitionParts(prisma, {
          schoolId: args.schoolId,
          classId: args.classId,
          section: student.class?.section ?? null,
          studentId: student.id,
          residencyType: student.residencyType ?? "Day Scholar",
        });
        const newTotalFee = parts.totalFee;
        const newFinalFee = finalFeeFromStructureAndExtras(
          parts.base,
          parts.extrasTotal,
          fee.discountPercent
        );
        const newRemainingFee = Math.max(0, newFinalFee - fee.amountPaid);

        await prisma.studentFee.update({
          where: { studentId: student.id },
          data: {
            totalFee: newTotalFee,
            finalFee: newFinalFee,
            remainingFee: newRemainingFee,
          },
        });
      })
    );
  }

  return { structure };
}
