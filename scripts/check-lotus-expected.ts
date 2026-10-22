/**
 * Read-only: compares each listed student's stored fee AND the profile figures (computed fresh, no cache,
 * nothing written) with the figures a school confirmed in writing. Prints MATCH or the difference.
 *   npx tsx scripts/check-lotus-expected.ts <schoolId> <expected.json>
 * expected.json: { "ADM/2026/LS1": { "final": 78000, "paid": 44000, "remaining": 34000 }, ... }
 */
import fs from "fs";
import prisma from "../lib/db";
import { computeAdminStudentFeeBreakdown } from "@/lib/fees/computeAdminStudentFeeBreakdown";

type Expected = { total?: number; final: number; paid: number; remaining: number };

async function main() {
  const [schoolId, file] = process.argv.slice(2);
  if (!schoolId || !file) throw new Error("usage: <schoolId> <expected.json>");
  const expected = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Expected>;
  let bad = 0;
  for (const [adm, exp] of Object.entries(expected)) {
    const st = await prisma.student.findFirst({ where: { schoolId, admissionNumber: adm }, select: { id: true } });
    if (!st) { console.log(`${adm}: NOT FOUND`); bad++; continue; }
    const fee = await prisma.studentFee.findUnique({ where: { studentId: st.id } });
    const bd = await computeAdminStudentFeeBreakdown(schoolId, st.id, { migrateLumps: false, cleanupHostelMessDuplicates: false, reconcileTotals: false });
    const near = (a: number, b: number) => Math.abs(a - b) <= 1.01;
    const checks = [
      ["stored final", fee?.finalFee ?? NaN, exp.final],
      ["stored paid", fee?.amountPaid ?? NaN, exp.paid],
      ["stored remaining", fee?.remainingFee ?? NaN, exp.remaining],
      ["profile final (+ previous year)", bd.finalFee + (bd.previousYearTotalAmount ?? 0), exp.final],
      ["profile paid (+ previous year)", bd.amountPaid + (bd.previousYearAmountPaid ?? 0), exp.paid],
      ["profile remaining (+ previous year)", bd.remainingFee + (bd.previousYearRemainingFee ?? 0), exp.remaining],
      ...(exp.total !== undefined ? ([["stored total", fee?.totalFee ?? NaN, exp.total]] as const) : []),
    ] as ReadonlyArray<readonly [string, number, number]>;
    const diffs = checks.filter(([, a, b]) => !near(a, b));
    if (diffs.length === 0) console.log(`${adm}: MATCH  (final ${exp.final}, paid ${exp.paid}, remaining ${exp.remaining})`);
    else {
      bad++;
      console.log(`${adm}: DIFFERENT`);
      for (const [n, a, b] of diffs) console.log(`    ${n}: now ${Math.round(a * 100) / 100}, school says ${b}`);
    }
  }
  console.log(bad === 0 ? "\nAll match." : `\n${bad} student(s) differ.`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
