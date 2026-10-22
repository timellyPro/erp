/**
 * Delete specific extra-fee rows that belong to ONE student (for example a transport fee entered twice),
 * then rebuild that student's stored fee (total, final, remaining) in the same transaction. Dry run
 * unless --apply is given: the dry run makes the changes inside a transaction and rolls it back.
 *
 * Safe by construction:
 *  - every id must be a STUDENT-targeted row for this student in this school;
 *  - a row that any payment allocation points at is refused (money is never orphaned);
 *  - payments and amountPaid are never touched.
 *
 * Usage:
 *   npx tsx scripts/delete-student-extra-fee-rows.ts --school-id=<id> --admission=ADM/2026/LS1626 --ids=<id1>,<id2> [--concession=<rupees>] [--apply]
 *
 * Use only with a school's written confirmation, and record the change in the school's repairs log.
 */
import prisma from "../lib/db";
import { recalculateStoredFees, type RecalcDb } from "@/lib/fees/recalculateStoredFee";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";

class DryRunRollback extends Error {}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const schoolId = arg("school-id");
  const admission = arg("admission");
  const ids = (arg("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const concessionArg = arg("concession");
  const concessionRupee = concessionArg === undefined ? undefined : Number(concessionArg);
  const apply = process.argv.includes("--apply");
  if (!schoolId || !admission || ids.length === 0) {
    console.error("Usage: --school-id=<id> --admission=<number> --ids=<id>,<id> [--concession=<rupees>] [--apply]");
    process.exit(2);
  }

  const student = await prisma.student.findFirst({ where: { schoolId, admissionNumber: admission }, select: { id: true } });
  if (!student) throw new Error("Student not found in this school");

  console.log(apply ? "APPLYING" : "DRY RUN: changes are made and then rolled back");
  let plan: Awaited<ReturnType<typeof recalculateStoredFees>>[number] | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const id of ids) {
          const row = await tx.extraFee.findFirst({
            where: { id, schoolId, targetType: "STUDENT", targetStudentId: student.id },
            select: { id: true, name: true, amount: true },
          });
          if (!row) throw new Error(`Row ${id} is not a student-targeted fee of this student in this school`);
          const used = await tx.paymentFeeAllocation.count({ where: { extraFeeId: id } });
          if (used > 0) throw new Error(`Row ${id} (${row.name}) has ${used} payment allocation(s); refusing to delete it`);
          console.log(`  delete: ${row.name} ${row.amount} [${id}]`);
          await tx.extraFee.delete({ where: { id } });
        }
        [plan] = await recalculateStoredFees(tx as unknown as RecalcDb, {
          schoolId,
          studentIds: [student.id],
          apply,
          concessionRupee,
        });
        if (!apply) throw new DryRunRollback();
      },
      { maxWait: 20_000, timeout: 90_000 }
    );
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
  }

  if (plan?.before && plan.after) {
    console.log(`  stored before: total ${plan.before.totalFee}, final ${plan.before.finalFee}, paid ${plan.before.amountPaid}, remaining ${plan.before.remainingFee}`);
    console.log(`  stored after:  total ${plan.after.totalFee}, final ${plan.after.finalFee}, paid ${plan.after.amountPaid}, remaining ${plan.after.remainingFee}`);
    if (plan.blockedReason) console.log(`  BLOCKED: ${plan.blockedReason}`);
  }
  if (apply) {
    invalidateStudentFeeReadCaches({ studentId: student.id, schoolId });
    console.log("written");
  } else {
    console.log("nothing was changed. Re-run with --apply to write.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
