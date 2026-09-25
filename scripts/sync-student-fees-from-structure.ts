/**
 * Re-sync every student's totalFee/finalFee from class structure + applicable extras.
 * Preserves chairman discounts (discountFeeHeadKey / discountRemarks) and amountPaid.
 *
 * Usage: npx tsx scripts/sync-student-fees-from-structure.ts --apply
 */
import prisma from "../lib/db";
import {
  buildStudentFeeRecalcPayload,
  buildTuitionBulkCache,
  finalFeeFromStructureAndExtras,
} from "../lib/studentTuitionFromStructure";
import { roundRupee } from "../lib/formatRupee";
import { invalidateStudentFeeReadCaches } from "../lib/studentFeeReadCache";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLYING fee sync from class structures" : "DRY RUN");

  const school = await prisma.school.findFirst({
    where: { name: { contains: "Lotus", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!school) throw new Error("School not found");

  const students = await prisma.student.findMany({
    where: { schoolId: school.id },
    select: {
      id: true,
      classId: true,
      residencyType: true,
      user: { select: { name: true } },
      class: { select: { name: true, section: true } },
      fee: {
        select: {
          totalFee: true,
          finalFee: true,
          amountPaid: true,
          remainingFee: true,
          discountPercent: true,
          discountFeeHeadKey: true,
          discountRemarks: true,
        },
      },
    },
  });

  const cache = await buildTuitionBulkCache(
    prisma,
    school.id,
    students.map((s) => s.classId)
  );

  let updated = 0;
  const samples: string[] = [];

  for (const st of students) {
    if (!st.fee) continue;
    const hasChairmanDiscount =
      Boolean(st.fee.discountFeeHeadKey?.trim()) || Boolean(st.fee.discountRemarks?.trim());

    const payload = buildStudentFeeRecalcPayload(
      {
        id: st.id,
        classId: st.classId,
        section: st.class?.section ?? null,
        residencyType: st.residencyType,
        discountPercent: st.fee.discountPercent,
        amountPaid: st.fee.amountPaid,
      },
      cache
    );

    let totalFee = payload.totalFee;
    let finalFee = payload.finalFee;

    if (hasChairmanDiscount && st.fee.totalFee > 0) {
      totalFee = roundRupee(st.fee.totalFee);
      finalFee = roundRupee(st.fee.finalFee);
    }

    const remainingFee = Math.max(0, roundRupee(finalFee - st.fee.amountPaid));

    const changed =
      (st.fee.totalFee <= 0 && totalFee > 0) ||
      (!hasChairmanDiscount &&
        (Math.abs(st.fee.totalFee - totalFee) > 1 || Math.abs(st.fee.finalFee - finalFee) > 1));

    if (changed) {
      updated += 1;
      if (samples.length < 20) {
        samples.push(
          `${st.user?.name} (${st.class?.name ?? "no class"}): ` +
            `total ${st.fee.totalFee}→${totalFee}, final ${st.fee.finalFee}→${finalFee}, ` +
            `pending ${st.fee.remainingFee}→${remainingFee}`
        );
      }
      if (apply) {
        await prisma.studentFee.update({
          where: { studentId: st.id },
          data: { totalFee, finalFee, remainingFee },
        });
        invalidateStudentFeeReadCaches({ studentId: st.id, schoolId: school.id });
      }
    }
  }

  console.log(`\n${apply ? "Updated" : "Would update"}: ${updated} students`);
  for (const s of samples) console.log(" ", s);
  if (!apply && updated > 0) console.log("\nRun with --apply to sync.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
