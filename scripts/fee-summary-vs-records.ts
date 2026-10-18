/**
 * Read-only: do the Summary page cards and the Fee Records list agree for one school?
 *
 * Summary (computeCurrentAndPreviousFeeStats) recomputes every student from the fee structure, extra fees
 * and payments; the Fee Records list shows the stored StudentFee copy. They can differ when a discount is
 * placed on a specific fee head (the stored final fee applies the percent to the whole structure) or when
 * a stored copy went stale. This prints both side by side, in rupees, with no student names.
 *
 *   npx tsx scripts/fee-summary-vs-records.ts --school-id=<id> [--students]
 *
 * --students also compares, per student, the stored copy with the student profile's own calculation
 * (read-only: the profile calculation is run without its write-back). Students are shown by number only.
 */
import prisma from "../lib/db";
import { computeCurrentAndPreviousFeeStats } from "@/lib/fees/computeFeeSummaryStats";
import { computeAdminStudentFeeBreakdown } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { activeStudentWhere } from "@/lib/students/studentStatus";

async function main() {
  const schoolId = process.argv.find((a) => a.startsWith("--school-id="))?.split("=")[1];
  if (!schoolId) throw new Error("Pass --school-id=<id>");

  const [stats, fees] = await Promise.all([
    computeCurrentAndPreviousFeeStats(schoolId),
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
