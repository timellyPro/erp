/**
 * Set the amounts of ONE student's own extra-fee rows (rows targeted at that student, e.g. the prorated
 * hostel/mess/transport rows a residency conversion creates), then rebuild that student's stored fee
 * (total, final, remaining) in the same transaction. Dry run unless --apply is given: the dry run makes
 * the changes inside a transaction and rolls it back, so the printed result is exactly what apply gives.
 * Payments and amountPaid are never touched.
 *
 * Usage:
 *   npx tsx scripts/set-student-extra-fee-amounts.ts --school-id=<id> --admission=ADM/2026/LS1511 \
 *     --set="Hostel Fee (1st Installment)=14300;Mess Fee (1st Installment)=10230"
 *   add --apply to write.
 *
 * Use only with a school's written confirmation of the amounts, and record the change in
 * docs/LOTUS_FEE_REPAIRS.md (or the equivalent for that school).
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
  const setArg = arg("set");
  const apply = process.argv.includes("--apply");
  if (!schoolId || !admission || !setArg) {
    console.error('Usage: --school-id=<id> --admission=<number> --set="Row name=amount;Row name=amount" [--apply]');
    process.exit(2);
  }
  const wanted = setArg
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.lastIndexOf("=");
      return { name: p.slice(0, i).trim(), amount: Number(p.slice(i + 1)) };
    });
  if (wanted.some((w) => !w.name || !Number.isFinite(w.amount) || w.amount < 0)) throw new Error("Bad --set value");

  const student = await prisma.student.findFirst({
    where: { schoolId, admissionNumber: admission },
    select: { id: true },
  });
  if (!student) throw new Error("Student not found in this school");

  console.log(apply ? "APPLYING" : "DRY RUN: changes are made and then rolled back");
  let plan: Awaited<ReturnType<typeof recalculateStoredFees>>[number] | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      for (const w of wanted) {
        const rows = await tx.extraFee.findMany({
          where: { schoolId, targetType: "STUDENT", targetStudentId: student.id, name: w.name },
          select: { id: true, name: true, amount: true },
        });
        if (rows.length !== 1) throw new Error(`Expected exactly one row named "${w.name}" for this student, found ${rows.length}`);
        console.log(`  ${rows[0]!.name}: ${rows[0]!.amount} -> ${w.amount}`);
        await tx.extraFee.update({ where: { id: rows[0]!.id }, data: { amount: w.amount } });
      }
      [plan] = await recalculateStoredFees(tx as unknown as RecalcDb, {
        schoolId,
        studentIds: [student.id],
        apply,
      });
      if (!apply) throw new DryRunRollback();
    }, { maxWait: 20_000, timeout: 90_000 });
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
