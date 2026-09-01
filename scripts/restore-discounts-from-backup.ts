/**
 * Compare Aug 2026 backup with current DB and restore chairman discount values.
 * Only updates totalFee, finalFee, discountPercent, discountFeeHeadLabel, discountRemarks.
 * Preserves amountPaid from live payments; recalculates remainingFee after restore.
 *
 * Usage:
 *   npx tsx scripts/restore-discounts-from-backup.ts --dry-run
 *   npx tsx scripts/restore-discounts-from-backup.ts --apply
 */
import prisma from "../lib/db";
import * as XLSX from "xlsx";
import { roundRupee } from "../lib/formatRupee";
import { invalidateStudentFeeReadCaches } from "../lib/studentFeeReadCache";

const BACKUP_PATH =
  "/Users/somasankar/Desktop/fees-backup-lotus-english-medium-high-school-2026-08-21 (2).xlsx";

type BackupRow = {
  admissionNo: string;
  name: string;
  totalFee: number;
  finalFee: number;
  discountPct: number;
  discountAmt: number;
  discountHead: string;
  discountRemarks: string;
};

function num(v: unknown): number {
  return roundRupee(Number(v) || 0);
}
function str(v: unknown): string {
  const s = String(v ?? "").trim();
  return s === "-" ? "" : s;
}

function backupDiscountAmount(b: BackupRow): number {
  if (b.discountAmt > 0) return b.discountAmt;
  return roundRupee(Math.max(0, b.totalFee - b.finalFee));
}

function loadBackupRows(): Map<string, BackupRow> {
  const wb = XLSX.readFile(BACKUP_PATH);
  const feesSheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Student Fees"]);
  const discSheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Discounts"]);
  const map = new Map<string, BackupRow>();

  for (const r of feesSheet) {
    const adm = str(r["Admission No"]);
    if (!adm) continue;
    map.set(adm, {
      admissionNo: adm,
      name: str(r["Student Name"]),
      totalFee: num(r["Total Fee (₹)"]),
      finalFee: num(r["Final Fee (₹)"]),
      discountPct: Number(r["Discount %"]) || 0,
      discountAmt: num(r["Discount Amount (₹)"]),
      discountHead: str(r["Discount Head"]),
      discountRemarks: str(r["Discount Remarks"]),
    });
  }

  for (const r of discSheet) {
    const adm = str(r["Admission ID"]);
    if (!adm) continue;
    const remark = str(r["Remark"]);
    const headPart = remark.split("|")[0]?.replace(/^Head:\s*/i, "").trim() || "";
    const remarksPart = remark.split("|").slice(1).join("|").trim();
    const finalFee = num(r["Final Fee (₹)"]);
    const discountAmt = num(r["Discount Amount (₹)"]);
    const discountPct = Number(r["Discount %"]) || 0;
    const totalFee = finalFee + discountAmt;

    const existing = map.get(adm);
    if (existing) {
      if (!existing.discountHead && headPart) existing.discountHead = headPart;
      if (!existing.discountRemarks && remarksPart) existing.discountRemarks = remarksPart;
      if (discountAmt > 0) existing.discountAmt = discountAmt;
      if (discountPct > 0) existing.discountPct = discountPct;
      if (totalFee > existing.totalFee) existing.totalFee = totalFee;
      if (finalFee > 0 && (existing.finalFee <= 0 || existing.totalFee === existing.finalFee)) {
        existing.finalFee = finalFee;
      }
      continue;
    }

    map.set(adm, {
      admissionNo: adm,
      name: str(r["Name"]),
      totalFee: totalFee || finalFee,
      finalFee,
      discountPct,
      discountAmt,
      discountHead: headPart,
      discountRemarks: remarksPart,
    });
  }

  return map;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLYING discount restore from Aug 21 backup" : "DRY RUN");

  const backupByAdm = loadBackupRows();
  console.log(`Loaded ${backupByAdm.size} students from backup`);

  const school = await prisma.school.findFirst({
    where: { name: { contains: "Lotus", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!school) throw new Error("Lotus school not found");

  const students = await prisma.student.findMany({
    where: { schoolId: school.id },
    select: {
      id: true,
      admissionNumber: true,
      user: { select: { name: true } },
      fee: {
        select: {
          id: true,
          totalFee: true,
          finalFee: true,
          discountPercent: true,
          discountFeeHeadLabel: true,
          discountRemarks: true,
          amountPaid: true,
          remainingFee: true,
        },
      },
    },
  });

  let restored = 0;
  const samples: string[] = [];

  for (const s of students) {
    const b = backupByAdm.get(s.admissionNumber);
    if (!b || !s.fee) continue;

    const hasDiscount =
      b.discountPct > 0 ||
      backupDiscountAmount(b) > 0 ||
      Boolean(b.discountHead) ||
      Boolean(b.discountRemarks);
    if (!hasDiscount) continue;

    const f = s.fee;
    const curDisc = roundRupee(Math.max(0, f.totalFee - f.finalFee));
    const bDisc = backupDiscountAmount(b);

    const needsRestore =
      Math.abs(f.totalFee - b.totalFee) > 1 ||
      Math.abs(f.finalFee - b.finalFee) > 1 ||
      Math.abs(curDisc - bDisc) > 1 ||
      (b.discountHead && f.discountFeeHeadLabel !== b.discountHead) ||
      (b.discountRemarks && f.discountRemarks !== b.discountRemarks);

    if (!needsRestore) continue;

    const newRemaining = Math.max(0, roundRupee(b.finalFee - f.amountPaid));

    if (samples.length < 25) {
      samples.push(
        `${s.user?.name || b.name} (${s.admissionNumber}): ` +
          `total ${f.totalFee}→${b.totalFee}, final ${f.finalFee}→${b.finalFee}, ` +
          `disc ₹${curDisc}→₹${bDisc}, pending ${f.remainingFee}→${newRemaining}`
      );
    }

    if (apply) {
      await prisma.studentFee.update({
        where: { studentId: s.id },
        data: {
          totalFee: b.totalFee,
          finalFee: b.finalFee,
          discountPercent: b.discountPct,
          discountFeeHeadLabel: b.discountHead || f.discountFeeHeadLabel,
          discountRemarks: b.discountRemarks || f.discountRemarks,
          remainingFee: newRemaining,
        },
      });
      invalidateStudentFeeReadCaches({ studentId: s.id, schoolId: school.id });
    }
    restored += 1;
  }

  console.log(`\nStudents ${apply ? "restored" : "needing restore"}: ${restored}`);
  if (samples.length) {
    console.log("\nSamples:");
    for (const line of samples) console.log(" ", line);
  }
  if (!apply && restored > 0) console.log("\nRun with --apply to restore from backup.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
