/**
 * Read-only: writes a JSON copy of everything a fee repair can touch for the given students (stored fee,
 * their own extra-fee rows, payments with allocations, discount approvals, residency periods), so a
 * repair can be reviewed or reversed by hand. Contains student data: keep the file OUT of the repo.
 *   npx tsx scripts/snapshot-student-fee-state.ts <schoolId> <outFile> ADM/2026/LS1 ADM/2026/LS2 ...
 */
import fs from "fs";
import prisma from "../lib/db";

async function main() {
  const [schoolId, outFile, ...adms] = process.argv.slice(2);
  if (!schoolId || !outFile || adms.length === 0) throw new Error("usage: <schoolId> <outFile> <admission>...");
  const out: Record<string, unknown> = { takenAt: new Date().toISOString(), schoolId, students: {} };
  for (const adm of adms) {
    const st = await prisma.student.findFirst({ where: { schoolId, admissionNumber: adm }, select: { id: true, admissionNumber: true, residencyType: true, classId: true } });
    if (!st) { (out.students as Record<string, unknown>)[adm] = "NOT FOUND"; continue; }
    const [fee, extras, payments, approvals, periods] = await Promise.all([
      prisma.studentFee.findUnique({ where: { studentId: st.id } }),
      prisma.extraFee.findMany({ where: { schoolId, targetType: "STUDENT", targetStudentId: st.id } }),
      prisma.payment.findMany({ where: { studentId: st.id }, include: { feeAllocations: true } as never }).catch(async () => {
        const p = await prisma.payment.findMany({ where: { studentId: st.id } });
        const a = await prisma.paymentFeeAllocation.findMany({ where: { studentId: st.id } });
        return p.map((x) => ({ ...x, feeAllocations: a.filter((y) => y.paymentId === x.id) }));
      }),
      prisma.feeDiscountApproval.findMany({ where: { studentId: st.id } }),
      prisma.studentResidencyPeriod.findMany({ where: { studentId: st.id } }),
    ]);
    (out.students as Record<string, unknown>)[adm] = { student: st, fee, extras, payments, approvals, periods };
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log("wrote", outFile, Object.keys(out.students as object).length, "students");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
