/**
 * Apply a school's confirmed hostel / day-scholar conversion to ONE student: the prorated hostel, mess and
 * transport rows, the residency periods, and the rebuilt stored fee, all in one transaction. For a school
 * whose conversion rule the app does not compute (for example a 10-month year), where the school has given
 * the amounts in writing. Payments and amountPaid are never touched.
 *
 * For each of hostel, mess and transport you give the TOTAL for the year's conversion; it is split into two
 * installments (the second takes the rounding). Hostel and mess rows are student-targeted conversion rows
 * (created when the student has none, updated when they do); transport updates the student's own transport
 * rows (it never creates one, because the route and name come from the student's assignment).
 *
 * Dry run unless --apply is given: the dry run makes the changes inside a transaction and rolls it back.
 *
 * Usage:
 *   npx tsx scripts/set-student-residency-conversion.ts --school-id=<id> --admission=ADM/2026/LS1614 \
 *     --hostel=21450 --mess=23870 --transport=7700 --from=Hosteller --to="Day Scholar" \
 *     --first-months=3 --second-months=7 --converted-on=2026-09-01 [--apply]
 */
import prisma from "../lib/db";
import { recalculateStoredFees, type RecalcDb } from "@/lib/fees/recalculateStoredFee";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";

class DryRunRollback extends Error {}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function halves(total: number): [number, number] {
  const first = Math.round((total / 2) * 100) / 100;
  return [first, Math.round((total - first) * 100) / 100];
}

async function main() {
  const schoolId = arg("school-id");
  const admission = arg("admission");
  const hostel = Number(arg("hostel"));
  const mess = Number(arg("mess"));
  const transportArg = arg("transport");
  const transport = transportArg === undefined ? undefined : Number(transportArg);
  const from = arg("from") ?? "Hosteller";
  const to = arg("to") ?? "Day Scholar";
  const firstMonths = Number(arg("first-months"));
  const secondMonths = Number(arg("second-months"));
  const convertedOn = arg("converted-on") ?? "";
  const apply = process.argv.includes("--apply");

  if (!schoolId || !admission || !Number.isFinite(hostel) || !Number.isFinite(mess) || !Number.isInteger(firstMonths) || !Number.isInteger(secondMonths) || !/^\d{4}-\d{2}-\d{2}$/.test(convertedOn)) {
    console.error("Usage: --school-id=<id> --admission=<no> --hostel=<total> --mess=<total> [--transport=<total>] --from=Hosteller --to=\"Day Scholar\" --first-months=<n> --second-months=<n> --converted-on=YYYY-MM-DD [--apply]");
    process.exit(2);
  }
  const yearStart = Number(convertedOn.slice(0, 4)) - (Number(convertedOn.slice(5, 7)) < 6 ? 1 : 0);

  const student = await prisma.student.findFirst({ where: { schoolId, admissionNumber: admission }, select: { id: true } });
  if (!student) throw new Error("Student not found in this school");

  console.log(apply ? "APPLYING" : "DRY RUN: changes are made and then rolled back");
  let plan: Awaited<ReturnType<typeof recalculateStoredFees>>[number] | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        const own = await tx.extraFee.findMany({
          where: { schoolId, targetType: "STUDENT", targetStudentId: student.id },
          select: { id: true, name: true, amount: true, residencyConversion: true },
        });

        for (const [label, total] of [["Hostel Fee", hostel], ["Mess Fee", mess]] as const) {
          const [a, b] = halves(total);
          for (const [suffix, amount] of [["(1st Installment)", a], ["(2nd Installment)", b]] as const) {
            const name = `${label} ${suffix}`;
            const found = own.filter((r) => r.name === name && r.residencyConversion);
            if (found.length > 1) throw new Error(`More than one conversion row named "${name}"`);
            if (found.length === 1) {
              console.log(`  ${name}: ${found[0]!.amount} -> ${amount}`);
              await tx.extraFee.update({ where: { id: found[0]!.id }, data: { amount } });
            } else {
              console.log(`  ${name}: (new) ${amount}`);
              await tx.extraFee.create({
                data: { schoolId, name, amount, targetType: "STUDENT", targetStudentId: student.id, residencyScope: "ALL", residencyConversion: true },
              });
            }
          }
        }

        if (transport !== undefined) {
          const rows = own.filter((r) => /transport/i.test(r.name) && !r.residencyConversion);
          const first = rows.filter((r) => /1st/i.test(r.name));
          const second = rows.filter((r) => /2nd/i.test(r.name));
          if (first.length !== 1 || second.length !== 1) throw new Error("Expected exactly one 1st and one 2nd transport row for this student");
          const [a, b] = halves(transport);
          console.log(`  ${first[0]!.name}: ${first[0]!.amount} -> ${a}`);
          console.log(`  ${second[0]!.name}: ${second[0]!.amount} -> ${b}`);
          await tx.extraFee.update({ where: { id: first[0]!.id }, data: { amount: a } });
          await tx.extraFee.update({ where: { id: second[0]!.id }, data: { amount: b } });
        }

        const old = await tx.studentResidencyPeriod.findMany({ where: { studentId: student.id, academicYearStartYear: yearStart }, select: { id: true } });
        await tx.studentResidencyPeriod.deleteMany({ where: { studentId: student.id, academicYearStartYear: yearStart } });
        const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
        await tx.studentResidencyPeriod.createMany({
          data: [
            { studentId: student.id, schoolId, academicYearStartYear: yearStart, residencyType: from, startedOn: d(`${yearStart}-06-01`), endedOn: d(convertedOn), months: firstMonths },
            { studentId: student.id, schoolId, academicYearStartYear: yearStart, residencyType: to, startedOn: d(convertedOn), endedOn: null, months: secondMonths },
          ],
        });
        console.log(`  residency periods: ${old.length} replaced by ${from} ${firstMonths} months, then ${to} ${secondMonths} months (from ${convertedOn})`);

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
