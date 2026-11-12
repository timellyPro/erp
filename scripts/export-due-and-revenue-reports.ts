/**
 * Read-only: writes the Fee Due Report and the Revenue Template for ONE school (active students) to xlsx,
 * from the same calculation as the portal's Summary page.
 *
 *   npx tsx scripts/export-due-and-revenue-reports.ts --school-name=Lotus --out-dir=docs
 *
 * The files contain student names and phone numbers: keep them private.
 */
import prisma from "../lib/db";
import { loadFeeSummaryRows } from "@/lib/fees/computeFeeSummaryStats";
import { buildFeeDueReportWorkbook } from "@/lib/fees/feeDueReportExcel";
import { buildFeeDueTemplateWorkbook } from "@/lib/fees/feeDueTemplateExcel";

async function main() {
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
  const name = arg("school-name");
  const outDir = arg("out-dir") ?? ".";
  if (!name) throw new Error("Pass --school-name=<part of the school name>");
  const schools = await prisma.school.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (schools.length !== 1) throw new Error(`Expected one school matching "${name}", found ${schools.length}`);
  const school = schools[0];

  const { rows, groups } = await loadFeeSummaryRows(school.id);
  const payload = { schoolName: school.name, generatedAt: new Date().toISOString(), groups, rows };
  const date = new Date().toISOString().slice(0, 10);

  const due = await buildFeeDueReportWorkbook(payload);
  await due.xlsx.writeFile(`${outDir}/Lotus_Fee_Due_Report_${date}.xlsx`);
  const rev = await buildFeeDueTemplateWorkbook(payload);
  await rev.xlsx.writeFile(`${outDir}/Lotus_Revenue_Template_${date}.xlsx`);
  console.log(`${school.name}: ${rows.length} students -> ${outDir}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
