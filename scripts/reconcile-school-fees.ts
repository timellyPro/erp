/**
 * Safe fee reconciliation — repairs orphan allocations and realigns StudentFee totals.
 * Never deletes payments or allocations.
 *
 * Usage:
 *   npx tsx scripts/reconcile-school-fees.ts --dry-run
 *   npx tsx scripts/reconcile-school-fees.ts --apply
 *   npx tsx scripts/reconcile-school-fees.ts --apply --school-id <id>
 */
import prisma from "../lib/db";
import { reconcileSchoolFeeIntegrity } from "../lib/reconcileStudentFeeIntegrity";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || !args.includes("--apply");
  const schoolIdArg = args.find((a) => a.startsWith("--school-id="))?.split("=")[1];

  let schoolId = schoolIdArg;
  if (!schoolId) {
    const school = await prisma.school.findFirst({ select: { id: true, name: true } });
    if (!school) throw new Error("No school found");
    schoolId = school.id;
    console.log(`Using school: ${school.name} (${schoolId})`);
  }

  console.log(dryRun ? "DRY RUN — no database writes" : "APPLYING changes to database");
  console.log("Starting reconciliation...\n");

  const report = await reconcileSchoolFeeIntegrity(schoolId, { dryRun });

  console.log("=== Reconciliation Report ===");
  console.log(`Students processed: ${report.studentsProcessed}`);
  console.log(`Students needing fix: ${report.studentsChanged}`);
  console.log(`Orphan allocations reassigned: ${report.allocationReassigned}`);
  console.log(`Allocation names backfilled: ${report.allocationNamesBackfilled}`);

  if (report.samples.length > 0) {
    console.log("\n=== Sample changes (up to 20) ===");
    for (const s of report.samples) {
      console.log(`\nStudent ${s.studentId}:`);
      console.log(
        `  totalFee: ${s.before.totalFee} → ${s.after.totalFee}` +
          (s.before.totalFee !== s.after.totalFee ? " (discount/gross fix)" : "")
      );
      console.log(
        `  finalFee: ${s.before.finalFee} → ${s.after.finalFee}` +
          (Math.abs(s.before.finalFee - s.after.finalFee) > 0.01 ? " (discount fix)" : "")
      );
      console.log(`  amountPaid: ${s.before.amountPaid} → ${s.after.amountPaid}`);
      console.log(
        `  remainingFee: ${s.before.remainingFee} → ${s.after.remainingFee}` +
          ` (discount ₹${s.after.discountAmount})`
      );
    }
  }

  if (dryRun && report.studentsChanged > 0) {
    console.log("\nRun with --apply to write these fixes.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
