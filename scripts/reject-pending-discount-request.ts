/**
 * Reject a student's PENDING concession request(s) with a reason, without touching the fee record. For a
 * request that no longer matches what the school confirmed (so an approval later cannot apply a stale
 * amount). Dry run unless --apply is given.
 *
 * Usage:
 *   npx tsx scripts/reject-pending-discount-request.ts --school-id=<id> --admission=ADM/2026/LS88 --reason="..." [--apply]
 */
import prisma from "../lib/db";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";
import { invalidateDiscountApprovalsListCache } from "@/lib/fees/discountApprovalsListCache";

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const schoolId = arg("school-id");
  const admission = arg("admission");
  const reason = (arg("reason") ?? "").trim();
  const apply = process.argv.includes("--apply");
  if (!schoolId || !admission || !reason) {
    console.error('Usage: --school-id=<id> --admission=<number> --reason="why" [--apply]');
    process.exit(2);
  }
  const student = await prisma.student.findFirst({ where: { schoolId, admissionNumber: admission }, select: { id: true } });
  if (!student) throw new Error("Student not found in this school");

  const pending = await prisma.feeDiscountApproval.findMany({
    where: { schoolId, studentId: student.id, status: "PENDING" },
    select: { id: true, discountPercent: true, discountFixedAmount: true, discountFeeHeadLabel: true, createdAt: true },
  });
  console.log(apply ? "APPLYING" : "DRY RUN: nothing will be changed");
  if (pending.length === 0) {
    console.log("  no pending requests for this student");
    return;
  }
  for (const p of pending) {
    console.log(`  pending ${p.id}: ${p.discountFixedAmount ?? p.discountPercent + "%"} on ${p.discountFeeHeadLabel} (created ${p.createdAt.toISOString().slice(0, 10)})`);
  }
  if (!apply) {
    console.log("Re-run with --apply to reject these.");
    return;
  }
  const res = await prisma.feeDiscountApproval.updateMany({
    where: { schoolId, studentId: student.id, status: "PENDING" },
    data: { status: "REJECTED", reviewRemarks: reason, reviewedAt: new Date() },
  });
  invalidateStudentFeeReadCaches({ studentId: student.id, schoolId });
  invalidateDiscountApprovalsListCache(schoolId);
  console.log(`rejected ${res.count}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
