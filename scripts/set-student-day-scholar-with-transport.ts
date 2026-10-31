/**
 * Make ONE student a Day Scholar for the whole year and give them their own transport pair, when the school
 * has confirmed it in writing. The standard Hostel row (hosteller scope) stops applying and the standard Mess
 * row (day-scholar scope) starts, so only the type and the transport rows are written here. Payments are never
 * touched (move any allocation off the hostel head afterwards with move-payment-allocation.ts).
 *
 * Dry run unless --apply is given: the changes are made inside a transaction and rolled back.
 *
 * Usage:
 *   npx tsx scripts/set-student-day-scholar-with-transport.ts --school-id=<id> --admission=ADM/2026/LS1351 \
 *     --transport=11000 --transport-name="Transport Fee 7-10 kms" [--apply]
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
  const transport = Number(arg("transport"));
  const transportName = arg("transport-name");
  const apply = process.argv.includes("--apply");
  if (!schoolId || !admission || !Number.isFinite(transport) || !transportName) {
    console.error('Usage: --school-id=<id> --admission=<no> --transport=<yearly total> --transport-name="Transport Fee 7-10 kms" [--apply]');
    process.exit(2);
  }
  const student = await prisma.student.findFirst({ where: { schoolId, admissionNumber: admission }, select: { id: true, residencyType: true } });
  if (!student) throw new Error("Student not found in this school");

  console.log(apply ? "APPLYING" : "DRY RUN: changes are made and then rolled back");
  let plan: Awaited<ReturnType<typeof recalculateStoredFees>>[number] | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        console.log(`  residency type: ${student.residencyType} -> Day Scholar`);
        await tx.student.update({ where: { id: student.id }, data: { residencyType: "Day Scholar" } });

        const first = Math.round((transport / 2) * 100) / 100;
        const second = Math.round((transport - first) * 100) / 100;
        for (const [suffix, amount] of [["(1st Installment)", first], ["(2nd Installment)", second]] as const) {
          const name = `${transportName} ${suffix}`;
          const exists = await tx.extraFee.findFirst({ where: { schoolId, targetType: "STUDENT", targetStudentId: student.id, name }, select: { id: true } });
          if (exists) throw new Error(`"${name}" already exists for this student`);
          console.log(`  ${name}: (new) ${amount}`);
          await tx.extraFee.create({ data: { schoolId, name, amount, targetType: "STUDENT", targetStudentId: student.id, residencyScope: "ALL" } });
        }

        [plan] = await recalculateStoredFees(tx as unknown as RecalcDb, { schoolId, studentIds: [student.id], apply });
        if (!apply) throw new DryRunRollback();
      },
      { maxWait: 20_000, timeout: 120_000 }
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
