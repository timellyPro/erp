/**
 * Read-only: collects everything the school fee report needs for ONE school into a JSON file
 * (per student: fee heads, discount, paid, due, flags for records that disagree, and every transaction).
 *
 * The file contains student names and payment details, so keep it private and delete it after the
 * report has been made. Nothing is written to the database.
 *
 *   npx tsx scripts/export-school-fee-report-data.ts --school-id=<id> --out=<path to .json>
 */
import { writeFileSync } from "node:fs";
import prisma from "../lib/db";
import { loadSchoolFeesBackupData } from "@/lib/fees/loadSchoolFeesBackupData";
import { loadFeeSummaryRows } from "@/lib/fees/computeFeeSummaryStats";
import { detectFeeTotalsDrift } from "@/lib/fees/feeTotalsDrift";
import { isStudentHosteller } from "@/lib/fees/extraFeeResidencyScope";
import { activeStudentWhere } from "@/lib/students/studentStatus";

const TOL = 1.01;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function main() {
  const schoolId = process.argv.find((a) => a.startsWith("--school-id="))?.split("=")[1];
  const out = process.argv.find((a) => a.startsWith("--out="))?.split("=").slice(1).join("=");
  if (!schoolId || !out) throw new Error("Pass --school-id=<id> and --out=<file.json>");

  const data = await loadSchoolFeesBackupData(schoolId);
  if (!data) throw new Error("School not found");

  const students = await prisma.student.findMany({
    where: { schoolId, ...activeStudentWhere },
    select: { id: true, admissionNumber: true, residencyType: true, class: { select: { name: true, section: true } } },
  });
  const classById = new Map(students.map((s) => [s.id, s.class ? `${s.class.name}${s.class.section && !s.class.name.includes(s.class.section) ? `-${s.class.section}` : ""}` : ""]));
  const activeIds = new Set(students.map((s) => s.id));
  const inactiveCount = await prisma.student.count({ where: { schoolId, NOT: { ...activeStudentWhere } } });

  const stored = new Map(data.studentFees.map((f) => [f.studentId, f]));
  // The figures come from the same calculation as the Summary page cards, so this report matches the portal.
  const summary = await loadFeeSummaryRows(schoolId);
  const rows = summary.rows.filter((r) => activeIds.has(r.studentId));
  const groupLabel = new Map(summary.groups.map((g) => [g.id, g.label]));

  // Receipt numbers (one query), and payments whose fee-head split does not add up to the payment.
  const payIds = data.transactions.map((t) => t.id);
  const receipts = new Map<string, number | null>();
  try {
    for (let i = 0; i < payIds.length; i += 1000) {
      const chunk = payIds.slice(i, i + 1000);
      const found = await prisma.payment.findMany({ where: { id: { in: chunk } }, select: { id: true, receiptNo: true } });
      for (const p of found) receipts.set(p.id, p.receiptNo);
    }
  } catch {
    // The receipt-number migration has not been applied to this database yet: report without them.
    console.log("Receipt numbers are not available in this database yet; leaving them blank.");
  }
  const overAllocated = (await prisma.$queryRaw`
    SELECT p.id, p.amount, COALESCE(SUM(a."allocatedAmount") FILTER (WHERE a."allocationType" = 'PAYMENT'), 0) AS allocated
    FROM "Payment" p JOIN "Student" s ON s.id = p."studentId"
    LEFT JOIN "PaymentFeeAllocation" a ON a."paymentId" = p.id
    WHERE s."schoolId" = ${schoolId} AND p.status = 'SUCCESS' AND p.purpose = 'FEES' AND p."eventRegistrationId" IS NULL
    GROUP BY p.id, p.amount
    HAVING abs(p.amount - COALESCE(SUM(a."allocatedAmount") FILTER (WHERE a."allocationType" = 'PAYMENT'), 0)) > 1
  `) as Array<{ id: string; amount: number; allocated: number }>;
  const overById = new Map(overAllocated.map((o) => [o.id, o]));

  const drift = await detectFeeTotalsDrift(schoolId);
  const driftByStudent = new Map(drift.samples.filter((s) => s.kind === "grossTotal").map((s) => [s.studentId, s]));

  const txByAdm = new Map<string, typeof data.transactions>();
  for (const t of data.transactions) {
    const adm = t.student?.admissionNumber ?? "";
    if (!adm) continue;
    const list = txByAdm.get(adm) ?? [];
    list.push(t);
    txByAdm.set(adm, list);
  }

  const residencyById = new Map(students.map((s) => [s.id, isStudentHosteller(s.residencyType) ? "Hosteller" : "Day Scholar"]));

  const outStudents = rows.map((r) => {
    const st = stored.get(r.studentId);
    const tx = (txByAdm.get(r.admissionNo) ?? []).map((t) => ({
      date: t.createdAt,
      receiptNo: receipts.get(t.id) ?? null,
      mode: t.gateway ?? "",
      reference: t.transactionId || t.hyperpgTxnId || "",
      amount: r2(t.amount ?? 0),
      collectedBy: t.collectedByName ?? "",
      heads: (t.feeAllocations ?? []).map((a) => ({ name: a.name, amount: r2(a.amount) })),
      splitMismatch: overById.has(t.id) ? r2(overById.get(t.id)!.allocated - (t.amount ?? 0)) : 0,
    }));
    const heads = Object.entries(r.cellsByGroupId)
      .map(([gid, c]) => ({ label: groupLabel.get(gid) ?? gid, fee: r2(c.fee), concession: r2(c.concession), paid: r2(c.paid), due: r2(c.due) }))
      .filter((h) => h.fee || h.concession || h.paid || h.due);

    const fee = r2(r.totalFee);
    const prevFee = r2(r.previousYearTotalFee ?? 0);
    const prevPaid = r2(r.previousYearFeesPaid ?? 0);
    const counted = r2(r.feesPaid + prevPaid);
    const flags: string[] = [];
    const d = driftByStudent.get(r.studentId);
    if (d) flags.push(`Saved total Rs ${d.stored} but fee setup says Rs ${d.expected} (difference ${d.difference >= 0 ? "+" : ""}${r2(d.difference)})`);
    if (st && st.amountPaid - counted > TOL) flags.push(`Rs ${r2(st.amountPaid - counted)} was paid against a fee the student does not currently owe`);
    const over = tx.filter((t) => t.splitMismatch > 1).reduce((s, t) => s + t.splitMismatch, 0);
    if (over > 0) flags.push(`Fee heads add up to Rs ${r2(over)} more than the cash received`);
    // Concessions given on previous-year dues sit on that head, not in the current-year discount.
    const allConcession = r2(heads.reduce((sum, h) => sum + h.concession, 0));
    if (st && Math.abs(st.finalFee - (fee + prevFee - allConcession)) > TOL && !d) {
      flags.push(`Saved final fee Rs ${r2(st.finalFee)} differs from the calculated Rs ${r2(fee + prevFee - allConcession)}`);
    }

    return {
      admissionNo: r.admissionNo,
      name: r.name,
      className: classById.get(r.studentId) ?? "",
      residency: residencyById.get(r.studentId) ?? "Day Scholar",
      fee,
      discount: r2(r.totalDiscount),
      paid: r2(r.feesPaid),
      due: r2(r.feesDue),
      previousYear: { fee: prevFee, paid: prevPaid, due: r2(r.previousYearFeesDue ?? 0) },
      stored: st ? { total: r2(st.totalFee), final: r2(st.finalFee), paid: r2(st.amountPaid), remaining: r2(st.remainingFee) } : null,
      discountLabel: st?.discountFeeHeadLabel ?? null,
      heads,
      flags,
      transactions: tx,
    };
  });

  outStudents.sort((a, b) => a.className.localeCompare(b.className, "en", { numeric: true }) || a.name?.localeCompare(b.name ?? "", "en") || 0);
  writeFileSync(out, JSON.stringify({ school: data.school, generatedAt: new Date().toISOString(), inactiveExcluded: inactiveCount, students: outStudents }));
  console.log(`Wrote ${outStudents.length} active students (${inactiveCount} inactive left out) to ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
