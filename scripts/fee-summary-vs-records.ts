/**
 * Read-only: do the Summary page cards and the Fee Records list agree for one school?
 *
 * Summary (computeCurrentAndPreviousFeeStats) recomputes every student from the fee structure, extra fees
 * and payments; the Fee Records list shows the stored StudentFee copy. They can differ when a discount is
 * placed on a specific fee head (the stored final fee applies the percent to the whole structure) or when
 * a stored copy went stale. This prints both side by side, in rupees, with no student names.
 *
 *   npx tsx scripts/fee-summary-vs-records.ts --school-id=<id> [--students] [--paid-gaps]
 *
 * --paid-gaps lists the students whose stored paid amount differs from what the Summary counts as paid.
 * --students also compares, per student, the stored copy with the student profile's own calculation
 * (read-only: the profile calculation is run without its write-back). Students are shown by number only.
 */
import prisma from "../lib/db";
import { loadFeeSummaryRows } from "@/lib/fees/computeFeeSummaryStats";
import { computeAdminStudentFeeBreakdown } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { activeStudentWhere } from "@/lib/students/studentStatus";

async function main() {
  const schoolId = process.argv.find((a) => a.startsWith("--school-id="))?.split("=")[1];
  if (!schoolId) throw new Error("Pass --school-id=<id>");

  const [{ stats, rows: summaryRows, netPaidByStudentHead }, fees] = await Promise.all([
    loadFeeSummaryRows(schoolId),
    prisma.studentFee.findMany({
      where: { student: { schoolId, ...activeStudentWhere } },
      select: { totalFee: true, finalFee: true, amountPaid: true, remainingFee: true, discountPercent: true, discountFeeHeadKey: true },
    }),
  ]);

  const sum = (f: (r: (typeof fees)[number]) => number) => fees.reduce((s, r) => s + f(r), 0);
  // The Records list stores current-year and previous-year dues together; the Summary splits them.
  // Add them back so the two sides cover the same money.
  const rows: Array<[string, number, number]> = [
    ["Total fee (before discount)", stats.totalFee + stats.previousYearTotalFee, sum((r) => r.totalFee)],
    ["Discount", stats.totalDiscount, sum((r) => r.totalFee - r.finalFee)],
    ["Collected", stats.totalCollected + stats.previousYearCollected, sum((r) => r.amountPaid)],
    ["Due", stats.totalDue + stats.previousYearDue, sum((r) => r.remainingFee)],
  ];
  console.log(
    `Summary split: current year fee ${Math.round(stats.totalFee).toLocaleString("en-IN")}, previous-year fee ${Math.round(stats.previousYearTotalFee).toLocaleString("en-IN")}`
  );
  const perHead = fees.filter((r) => r.discountFeeHeadKey && r.discountFeeHeadKey !== "__DISCOUNT_OVERALL__").length;
  console.log(`${fees.length} active students | ${fees.filter((r) => r.discountPercent > 0).length} with a discount | ${perHead} with a per-head discount`);
  console.log("Measure".padEnd(30), "Summary".padStart(14), "Records".padStart(14), "Difference".padStart(12));
  for (const [label, a, b] of rows) {
    console.log(label.padEnd(30), Math.round(a).toLocaleString("en-IN").padStart(14), Math.round(b).toLocaleString("en-IN").padStart(14), Math.round(a - b).toLocaleString("en-IN").padStart(12));
  }
  if (process.argv.includes("--paid-gaps")) {
    // Per student: what is recorded as paid (stored copy) vs what the Summary counts as paid, and how
    // much of the student's payment allocations the Summary could not place on a fee head.
    const stored = await prisma.studentFee.findMany({
      where: { student: { schoolId, ...activeStudentWhere } },
      select: { studentId: true, amountPaid: true, student: { select: { admissionNumber: true } } },
    });
    const allocatedByStudent = new Map<string, number>();
    for (const [key, v] of netPaidByStudentHead) {
      const sid = key.split("|")[0]!;
      allocatedByStudent.set(sid, (allocatedByStudent.get(sid) ?? 0) + v);
    }
    const rowByStudent = new Map(summaryRows.map((r) => [r.studentId, r]));
    const gaps = stored
      .map((f) => {
        const r = rowByStudent.get(f.studentId);
        const counted = (r?.feesPaid ?? 0) + (r?.previousYearFeesPaid ?? 0);
        const allocated = allocatedByStudent.get(f.studentId) ?? 0;
        return { adm: f.student.admissionNumber, stored: f.amountPaid, allocated, counted, gap: f.amountPaid - counted, notPlaced: allocated - counted };
      })
      .filter((g) => Math.abs(g.gap) > 1)
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    console.log(`
${gaps.length} students where stored paid differs from what the Summary counts (total ${Math.round(gaps.reduce((s, g) => s + g.gap, 0)).toLocaleString("en-IN")})`);
    console.log("admission no".padEnd(20), "stored paid".padStart(12), "allocations".padStart(12), "summary".padStart(12), "gap".padStart(10), "unplaced".padStart(10));
    for (const g of gaps.slice(0, 40)) {
      const n = (x: number) => Math.round(x).toLocaleString("en-IN");
      console.log(g.adm.padEnd(20), n(g.stored).padStart(12), n(g.allocated).padStart(12), n(g.counted).padStart(12), n(g.gap).padStart(10), n(g.notPlaced).padStart(10));
    }
  }
  if (process.argv.includes("--students")) {
    const list = await prisma.studentFee.findMany({
      where: { student: { schoolId, ...activeStudentWhere } },
      select: { studentId: true, totalFee: true, finalFee: true, amountPaid: true, remainingFee: true, discountPercent: true, discountFeeHeadKey: true },
      orderBy: { studentId: "asc" },
    });
    console.log("\n#   stored total  profile total | stored final profile final | stored due profile due | discount");
    let i = 0;
    for (const f of list) {
      i += 1;
      const b = await computeAdminStudentFeeBreakdown(schoolId, f.studentId, {
        reconcileTotals: false,
        migrateLumps: false,
        cleanupHostelMessDuplicates: false,
      });
      const n = (x: number) => Math.round(x).toLocaleString("en-IN").padStart(10);
      console.log(
        `${String(i).padEnd(3)} ${n(f.totalFee)} ${n(b.totalAmount)} | ${n(f.finalFee)} ${n(b.finalFee)} | ${n(f.remainingFee)} ${n(b.remainingFee)} | ${f.discountPercent > 0 ? "yes" : "-"}${f.discountFeeHeadKey && f.discountFeeHeadKey !== "__DISCOUNT_OVERALL__" ? " per-head" : ""}`
      );
    }
  }
  console.log("(Summary rows above are current year plus previous year, to match the stored copy.)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
