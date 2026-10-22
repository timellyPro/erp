/**
 * Set how many months a school bills in its year for hostel / day-scholar conversions (1-12, default 12).
 * The same value the school admin can set under Settings. Does NOT change any fee already saved: it only
 * applies to conversions made afterwards. Dry run unless --apply is given.
 *
 * Usage:
 *   npx tsx scripts/set-school-residency-months.ts --school-id=<id> --months=10 [--apply]
 */
import prisma from "../lib/db";

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const schoolId = arg("school-id");
  const months = Number(arg("months"));
  const apply = process.argv.includes("--apply");
  if (!schoolId || !Number.isInteger(months) || months < 1 || months > 12) {
    console.error("Usage: --school-id=<id> --months=<1-12> [--apply]");
    process.exit(2);
  }
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) throw new Error("School not found");
  const current = await prisma.schoolSettings.findUnique({ where: { schoolId }, select: { residencyYearMonths: true } });
  console.log(apply ? "APPLYING" : "DRY RUN: nothing will be changed");
  console.log(`  residencyYearMonths: ${current?.residencyYearMonths ?? "(no settings row, default 12)"} -> ${months}`);
  if (!apply) {
    console.log("Re-run with --apply to write.");
    return;
  }
  await prisma.schoolSettings.upsert({
    where: { schoolId },
    create: { schoolId, residencyYearMonths: months },
    update: { residencyYearMonths: months },
  });
  console.log("written");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
