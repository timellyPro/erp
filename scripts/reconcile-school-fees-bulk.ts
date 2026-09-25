/**
 * Fast bulk reconciliation — fixes amountPaid (from payments) and remainingFee
 * (finalFee − paid) for all students. Never deletes data.
 *
 * Usage:
 *   npx tsx scripts/reconcile-school-fees-bulk.ts --dry-run
 *   npx tsx scripts/reconcile-school-fees-bulk.ts --apply
 */
import prisma from "../lib/db";
import { repairOrphanExtraFeeAllocations } from "../lib/repairOrphanExtraFeeAllocations";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLYING bulk fee fix" : "DRY RUN — no writes");

  const allocRepair = apply
    ? await repairOrphanExtraFeeAllocations(prisma, (await prisma.school.findFirst({ select: { id: true } }))!.id)
    : { reassigned: 0, namesBackfilled: 0 };
  console.log("Orphan allocation repair:", allocRepair);

  const preview = await prisma.$queryRaw<
    Array<{ cnt: number; total_diff: number }>
  >`
    SELECT
      COUNT(*)::int AS cnt,
      COALESCE(SUM(ABS(sf."remainingFee" - GREATEST(ROUND(sf."finalFee" - COALESCE(pay.sum, 0)), 0))), 0)::float AS total_diff
    FROM "StudentFee" sf
    LEFT JOIN (
      SELECT "studentId", SUM(amount) AS sum
      FROM "Payment"
      WHERE status IN ('SUCCESS', 'COMPLETED')
        AND purpose = 'FEES'
        AND "eventRegistrationId" IS NULL
      GROUP BY "studentId"
    ) pay ON pay."studentId" = sf."studentId"
    WHERE ABS(sf."amountPaid" - COALESCE(pay.sum, 0)) > 0.01
       OR ABS(sf."remainingFee" - GREATEST(ROUND(sf."finalFee" - COALESCE(pay.sum, 0)), 0)) > 0.01
  `;
  console.log("Students needing fix:", preview[0]);

  if (!apply) {
    const samples = await prisma.$queryRaw<
      Array<{ name: string; finalFee: number; amountPaid: number; remainingFee: number; pay_sum: number; new_remaining: number }>
    >`
      SELECT u.name, sf."finalFee", sf."amountPaid", sf."remainingFee",
             COALESCE(pay.sum, 0)::float AS pay_sum,
             GREATEST(ROUND(sf."finalFee" - COALESCE(pay.sum, 0)), 0)::float AS new_remaining
      FROM "StudentFee" sf
      JOIN "Student" s ON s.id = sf."studentId"
      JOIN "User" u ON u.id = s."userId"
      LEFT JOIN (
        SELECT "studentId", SUM(amount) AS sum
        FROM "Payment"
        WHERE status IN ('SUCCESS', 'COMPLETED') AND purpose = 'FEES' AND "eventRegistrationId" IS NULL
        GROUP BY "studentId"
      ) pay ON pay."studentId" = sf."studentId"
      WHERE ABS(sf."remainingFee" - GREATEST(ROUND(sf."finalFee" - COALESCE(pay.sum, 0)), 0)) > 1
      ORDER BY ABS(sf."remainingFee" - GREATEST(ROUND(sf."finalFee" - COALESCE(pay.sum, 0)), 0)) DESC
      LIMIT 10
    `;
    console.log("\nTop samples:", JSON.stringify(samples, null, 2));
    console.log("\nRun with --apply to fix.");
    return;
  }

  const updated = await prisma.$executeRaw`
    UPDATE "StudentFee" sf
    SET
      "amountPaid" = COALESCE(pay.sum, 0),
      "remainingFee" = GREATEST(0, ROUND(sf."finalFee" - COALESCE(pay.sum, 0))),
      "updatedAt" = NOW()
    FROM (
      SELECT "studentId", SUM(amount) AS sum
      FROM "Payment"
      WHERE status IN ('SUCCESS', 'COMPLETED')
        AND purpose = 'FEES'
        AND "eventRegistrationId" IS NULL
      GROUP BY "studentId"
    ) pay
    WHERE sf."studentId" = pay."studentId"
      AND (
        ABS(sf."amountPaid" - pay.sum) > 0.01
        OR ABS(sf."remainingFee" - GREATEST(ROUND(sf."finalFee" - pay.sum), 0)) > 0.01
      )
  `;
  console.log("Rows updated (with payments):", updated);

  const zeroPayUpdated = await prisma.$executeRaw`
    UPDATE "StudentFee" sf
    SET
      "amountPaid" = 0,
      "remainingFee" = GREATEST(0, ROUND(sf."finalFee")),
      "updatedAt" = NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM "Payment" p
      WHERE p."studentId" = sf."studentId"
        AND p.status IN ('SUCCESS', 'COMPLETED')
        AND p.purpose = 'FEES'
        AND p."eventRegistrationId" IS NULL
    )
    AND (sf."amountPaid" > 0.01 OR ABS(sf."remainingFee" - ROUND(sf."finalFee")) > 0.01)
  `;
  console.log("Rows updated (no payments):", zeroPayUpdated);

  const after = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM "StudentFee"
    WHERE ABS("remainingFee" - GREATEST(ROUND("finalFee" - "amountPaid"), 0)) > 1
  `;
  console.log("Remaining mismatches after fix:", after[0]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
