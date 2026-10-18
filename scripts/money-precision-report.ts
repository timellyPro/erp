/**
 * Read-only: how many stored money values are not a whole number of paise?
 *
 * Money columns are Float (double precision). Decimal would remove binary rounding noise, but changing the
 * type touches every fee read and write (docs/DECIMAL_MIGRATION_PLAN.md). This counts, per column, the
 * rows whose value differs from itself rounded to 2 decimals, and the rows that are not whole rupees, so
 * the decision is made on data. Counts only; no student, school or payment details are printed.
 *
 *   npx tsx scripts/money-precision-report.ts [--school-id=<id>]
 */
import prisma from "../lib/db";

type Col = { table: string; column: string; schoolFilter: string | null };

// schoolFilter: a SQL fragment (with {t} for the table alias) that restricts rows to one school, or null.
const COLUMNS: Col[] = [
  { table: "StudentFee", column: "totalFee", schoolFilter: `"studentId" IN (SELECT id FROM "Student" WHERE "schoolId" = $1)` },
  { table: "StudentFee", column: "finalFee", schoolFilter: `"studentId" IN (SELECT id FROM "Student" WHERE "schoolId" = $1)` },
  { table: "StudentFee", column: "amountPaid", schoolFilter: `"studentId" IN (SELECT id FROM "Student" WHERE "schoolId" = $1)` },
  { table: "StudentFee", column: "remainingFee", schoolFilter: `"studentId" IN (SELECT id FROM "Student" WHERE "schoolId" = $1)` },
  { table: "StudentFee", column: "discountPercent", schoolFilter: `"studentId" IN (SELECT id FROM "Student" WHERE "schoolId" = $1)` },
  { table: "Payment", column: "amount", schoolFilter: `"studentId" IN (SELECT id FROM "Student" WHERE "schoolId" = $1)` },
  { table: "PaymentFeeAllocation", column: "allocatedAmount", schoolFilter: `"studentId" IN (SELECT id FROM "Student" WHERE "schoolId" = $1)` },
  { table: "ExtraFee", column: "amount", schoolFilter: `"schoolId" = $1` },
  { table: "FeeDiscountApproval", column: "finalFee", schoolFilter: null },
  { table: "PettyCashExpense", column: "amount", schoolFilter: `"schoolId" = $1` },
];

async function main() {
  const schoolId = process.argv.find((a) => a.startsWith("--school-id="))?.split("=")[1];
  console.log("table.column".padEnd(34), "rows".padStart(9), "not 2dp".padStart(9), "not whole".padStart(10));
  for (const c of COLUMNS) {
    const where = schoolId && c.schoolFilter ? `WHERE ${c.schoolFilter}` : "";
    const params = schoolId && c.schoolFilter ? [schoolId] : [];
    const col = `"${c.column}"`;
    const sql = `SELECT count(*)::int AS rows,
        count(*) FILTER (WHERE ${col} IS NOT NULL AND ${col}::numeric <> round(${col}::numeric, 2))::int AS not2dp,
        count(*) FILTER (WHERE ${col} IS NOT NULL AND ${col}::numeric <> round(${col}::numeric))::int AS notwhole
      FROM "${c.table}" ${where}`;
    try {
      const rows = (await prisma.$queryRawUnsafe(sql, ...params)) as Array<{ rows: number; not2dp: number; notwhole: number }>;
      const r = rows[0]!;
      console.log(`${c.table}.${c.column}`.padEnd(34), String(r.rows).padStart(9), String(r.not2dp).padStart(9), String(r.notwhole).padStart(10));
    } catch (e) {
      console.log(`${c.table}.${c.column}`.padEnd(34), "error:", (e as Error).message.split("\n")[0]);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
