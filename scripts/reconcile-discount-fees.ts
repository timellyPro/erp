/**
 * Fix totalFee/finalFee/discount for students with discounts or fractional amounts.
 * Uses fee-head breakdown — never deletes payments.
 *
 * Usage: npx tsx scripts/reconcile-discount-fees.ts --apply
 */
import prisma from "../lib/db";
import { reconcileStudentFeeIntegrity } from "../lib/reconcileStudentFeeIntegrity";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLYING discount fee fixes" : "DRY RUN");

  const school = await prisma.school.findFirst({ select: { id: true, name: true } });
  if (!school) throw new Error("No school");
  console.log(`School: ${school.name}`);

  const students = await prisma.$queryRaw<Array<{ studentId: string; name: string }>>`
    SELECT sf."studentId", u.name
    FROM "StudentFee" sf
    JOIN "Student" s ON s.id = sf."studentId"
    JOIN "User" u ON u.id = s."userId"
    WHERE s."schoolId" = ${school.id}
      AND (
        sf."discountPercent" > 0
        OR ABS(sf."totalFee" - sf."finalFee") > 0.01
        OR sf."finalFee" != ROUND(sf."finalFee"::numeric, 0)
        OR sf."totalFee" != ROUND(sf."totalFee"::numeric, 0)
      )
  `;

  console.log(`Students to reconcile: ${students.length}`);
  let changed = 0;

  for (const { studentId, name } of students) {
    try {
      const result = await reconcileStudentFeeIntegrity(school.id, studentId, {
        apply,
        repairAllocations: false,
      });
      if (result?.changed) {
        changed += 1;
        console.log(
          `${name}: totalFee ${result.before.totalFee}→${result.after.totalFee}, ` +
            `finalFee ${result.before.finalFee}→${result.after.finalFee}, ` +
            `discount ₹${result.after.discountAmount}, pending ${result.after.remainingFee}`
        );
      }
    } catch (e) {
      console.error(`Failed ${name} (${studentId}):`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\nDone. ${changed}/${students.length} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
