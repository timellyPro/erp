/**
 * Read-only fee drift check across every school. For each active student it compares the stored fee
 * (StudentFee) with what the fee structure, the extra fees and the payments say it should be:
 *   grossTotal  stored total vs class structure + applicable extra fees
 *   amountPaid  stored paid amount vs the sum of successful fee payments
 *   remaining   stored remaining vs stored final fee minus stored paid
 * (lib/fees/feeTotalsDrift.ts). A few queries per school, so it takes seconds, not minutes.
 *
 * The output is safe for a PUBLIC CI log: counts only, schools by number, no names and no student ids,
 * unless you pass --details (for running locally: prints the differing students).
 *
 * Usage:
 *   npx tsx scripts/fee-integrity-report.ts
 *   npx tsx scripts/fee-integrity-report.ts --details          # local only: lists students
 *   npx tsx scripts/fee-integrity-report.ts --deep             # also run the slower per-student breakdown check
 *   FEE_INTEGRITY_MAX_CHANGED=11 npx tsx scripts/fee-integrity-report.ts   # known baseline
 *
 * Exit code 1 when more students than FEE_INTEGRITY_MAX_CHANGED (default 0) have drifted, so a
 * scheduled run turns red (and GitHub emails the repo admins) when new drift appears.
 *
 * Writes nothing. To repair a school, use scripts/reconcile-school-fees.ts for that school (dry run
 * first, and only after the school has confirmed what the totals should be).
 */
import prisma from "../lib/db";
import { detectFeeTotalsDrift } from "@/lib/fees/feeTotalsDrift";
import { reconcileSchoolFeeIntegrity } from "@/lib/fees/reconcileStudentFeeIntegrity";

async function main() {
  const maxChanged = Number(process.env.FEE_INTEGRITY_MAX_CHANGED ?? "0");
  const details = process.argv.includes("--details");
  const deep = process.argv.includes("--deep");
  const schools = await prisma.school.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });

  let checked = 0;
  let drifted = 0;
  let deepChanged = 0;
  let index = 0;
  for (const school of schools) {
    index += 1;
    const report = await detectFeeTotalsDrift(school.id);
    checked += report.studentsChecked;
    drifted += report.studentsDrifted;
    console.log(
      `school ${index}/${schools.length}: ${report.studentsChecked} students checked, ${report.studentsDrifted} drifted ` +
        `(total ${report.byKind.grossTotal}, paid ${report.byKind.amountPaid}, remaining ${report.byKind.remaining})`
    );
    if (details) {
      for (const s of report.samples) {
        console.log(`  ${s.studentId} ${s.kind}: stored ${s.stored}, expected ${s.expected} (${s.difference >= 0 ? "+" : ""}${s.difference})`);
      }
    }
    if (deep) {
      const r = await reconcileSchoolFeeIntegrity(school.id, { dryRun: true });
      deepChanged += r.studentsChanged;
      console.log(`  deep check: ${r.studentsProcessed} processed, ${r.studentsChanged} would change`);
    }
  }

  console.log(`\ntotal: ${checked} students checked, ${drifted} drifted (allowed: ${maxChanged})`);
  if (deep) console.log(`deep check: ${deepChanged} would change (informational)`);
  if (drifted > maxChanged) {
    console.error("FEE INTEGRITY CHECK FAILED: more stored fees have drifted than expected");
    process.exit(1);
  }
  console.log("Fee integrity check passed");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
