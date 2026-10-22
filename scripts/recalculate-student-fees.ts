/**
 * Recalculate the STORED fee (total, final, remaining) of specific students from the class fee structure
 * and their extra fees. For students that scripts/fee-integrity-report.ts flags with a wrong gross total.
 * Dry run unless --apply is given. amountPaid is never changed. See lib/fees/recalculateStoredFee.ts.
 *
 * Usage:
 *   npx tsx scripts/recalculate-student-fees.ts --school-id=<id> --student-ids=<id1>,<id2>
 *   npx tsx scripts/recalculate-student-fees.ts --school-id=<id> --student-ids=<id1>,<id2> --apply
 *   --concession=<rupees> (one student): use the rupee concession the school confirmed in writing
 *   --head-key=BASE:1 --head-label="Tuition Fee 2nd Installment" --remarks="..." (with --concession): also record the concession on the fee record
 *   add --allow-discount only after a person has reviewed a student that has a discount
 *
 * Confirm with the school what each student should owe, and take a backup, before --apply.
 * Save the printed before/after: stored fee changes are not written to a history table.
 */
import prisma from "../lib/db";
import { recalculateStoredFees, type RecalcDb } from "@/lib/fees/recalculateStoredFee";

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const schoolId = arg("school-id");
  const ids = (arg("student-ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const apply = process.argv.includes("--apply");
  const allowDiscount = process.argv.includes("--allow-discount");
  const concessionArg = arg("concession");
  const concessionRupee = concessionArg === undefined ? undefined : Number(concessionArg);
  const headKey = arg("head-key");
  const headLabel = arg("head-label");
  const remarks = arg("remarks");
  const concessionRecord = headKey && headLabel && remarks ? { headKey, headLabel, remarks } : undefined;

  if (!schoolId || ids.length === 0) {
    console.error("Usage: --school-id=<id> --student-ids=<id1>,<id2> [--apply] [--allow-discount] [--concession=<rupees>]");
    process.exit(2);
  }

  console.log(apply ? "APPLYING: stored fees will be rewritten" : "DRY RUN: nothing will be changed");
  const plans = await recalculateStoredFees(prisma as unknown as RecalcDb, { schoolId, studentIds: ids, apply, allowDiscount, concessionRupee, concessionRecord });

  let wouldChange = 0;
  let blocked = 0;
  for (const p of plans) {
    console.log(`\nstudent ${p.studentId}`);
    if (!p.found) {
      console.log(`  skipped: ${p.blockedReason}`);
      blocked += 1;
      continue;
    }
    console.log(`  before: total ${p.before!.totalFee}, final ${p.before!.finalFee}, paid ${p.before!.amountPaid}, remaining ${p.before!.remainingFee}`);
    console.log(`  after:  total ${p.after!.totalFee}, final ${p.after!.finalFee}, paid ${p.after!.amountPaid}, remaining ${p.after!.remainingFee}`);
    if (p.blockedReason) {
      console.log(`  BLOCKED: ${p.blockedReason}`);
      blocked += 1;
    } else if (p.changed) {
      wouldChange += 1;
      console.log(apply ? "  rewritten" : "  would be rewritten");
    } else {
      console.log("  already correct");
    }
  }
  console.log(`\n${apply ? "rewritten" : "would rewrite"}: ${wouldChange}, blocked/skipped: ${blocked}, total: ${plans.length}`);
  if (!apply && wouldChange > 0) console.log("Re-run with --apply to make these changes.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
