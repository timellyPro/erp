/**
 * Read-only: for the given admission numbers of one school, prints the stored fee, the payments, and what
 * the fee structure + extra fees say the total should be. Writes nothing.
 *   npx tsx scripts/show-student-fee-plan.ts <schoolId> ADM/2026/LS1279 ...
 */
import prisma from "../lib/db";
import { computeStudentTuitionParts } from "@/lib/fees/studentTuitionFromStructure";

async function main() {
  const [schoolId, ...adms] = process.argv.slice(2);
  if (!schoolId || adms.length === 0) throw new Error("usage: <schoolId> <admissionNumber>...");
  for (const adm of adms) {
    const st = await prisma.student.findFirst({
      where: { schoolId, admissionNumber: { endsWith: adm, mode: "insensitive" } },
      select: { id: true, user: { select: { name: true } }, admissionNumber: true, classId: true, residencyType: true, class: { select: { name: true, section: true } } },
    });
    if (!st) { console.log(`\n${adm}: NOT FOUND`); continue; }
    const fee = await prisma.studentFee.findFirst({ where: { studentId: st.id } });
    const parts = await computeStudentTuitionParts(prisma, {
      schoolId, classId: st.classId, section: st.class?.section ?? null, studentId: st.id, residencyType: st.residencyType ?? "Day Scholar",
    });
    const pays = await prisma.payment.findMany({
      where: { studentId: st.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, amount: true, status: true, createdAt: true },
    });
    const approvals = await prisma.$queryRaw<unknown[]>`SELECT status::text, "discountPercent", "discountFixedAmount", "discountFeeHeadLabel", "discountRemarks", "createdAt" FROM "FeeDiscountApproval" WHERE "studentId" = ${st.id} ORDER BY "createdAt"`;
    console.log(`\n=== ${st.admissionNumber} ${st.user?.name} | ${st.class?.name}-${st.class?.section} | ${st.residencyType}`);
    console.log("stored :", fee && { totalFee: fee.totalFee, discountPercent: fee.discountPercent, finalFee: fee.finalFee, amountPaid: fee.amountPaid, remainingFee: fee.remainingFee, headKey: fee.discountFeeHeadKey, remarks: fee.discountRemarks });
    console.log("expect :", { structure: parts.base, extras: parts.extrasTotal, gross: parts.totalFee });
    console.log("payments:", pays.map((p) => `${p.createdAt.toISOString().slice(0, 10)} ${p.amount} ${p.status}`));
    console.log("approvals:", JSON.stringify(approvals));
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
