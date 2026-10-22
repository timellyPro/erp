/**
 * Move one payment allocation from the fee head it was recorded against to other heads, when a school has
 * confirmed in writing where that money belongs. The payment, its amount and the student's total paid never
 * change. Dry run unless --apply is given. See lib/fees/movePaymentAllocation.ts.
 *
 * --to takes ';'-separated targets that must add up to the allocation amount:
 *   extra:<extraFeeId>=<amount>            an extra-fee head (mess, hostel, transport rows)
 *   base:<componentIndex>:<name>=<amount>  a class fee-structure component (e.g. base:1:Tuition Fee - 2nd Installment=500)
 *
 * Usage:
 *   npx tsx scripts/move-payment-allocation.ts --school-id=<id> --allocation-id=<id> --to="extra:<id>=17050;extra:<id2>=1650" --reason="..." [--apply]
 *
 * The change is written to the payment's history (Fees > Receipt Lookup & History).
 */
import os from "os";
import prisma from "../lib/db";
import { movePaymentAllocation, type MoveDb, type MoveTarget } from "@/lib/fees/movePaymentAllocation";
import { invalidateStudentFeeReadCaches } from "@/lib/fees/studentFeeReadCache";

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function parseTargets(raw: string): MoveTarget[] {
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const eq = p.lastIndexOf("=");
      const amount = Number(p.slice(eq + 1));
      const key = p.slice(0, eq).trim();
      if (key.startsWith("extra:")) return { headType: "EXTRA_FEE" as const, extraFeeId: key.slice(6), amount };
      if (key.startsWith("base:")) {
        const [, idx, ...name] = key.split(":");
        return { headType: "BASE_COMPONENT" as const, componentIndex: Number(idx), componentName: name.join(":"), amount };
      }
      throw new Error(`Bad target "${p}"`);
    });
}

async function main() {
  const schoolId = arg("school-id");
  const allocationId = arg("allocation-id");
  const to = arg("to");
  const reason = arg("reason") ?? "";
  const apply = process.argv.includes("--apply");
  if (!schoolId || !allocationId || !to) {
    console.error('Usage: --school-id=<id> --allocation-id=<id> --to="extra:<id>=amount;..." --reason="why" [--apply]');
    process.exit(2);
  }
  console.log(apply ? "APPLYING: this will replace the allocation" : "DRY RUN: nothing will be changed");
  const result = await movePaymentAllocation(prisma as unknown as MoveDb, {
    schoolId,
    allocationId,
    targets: parseTargets(to),
    reason,
    actor: { userId: null, name: `Maintenance script (${os.userInfo().username})`, role: "SYSTEM" },
    apply,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
  if (result.applied) {
    const alloc = await prisma.paymentFeeAllocation.findFirst({
      where: { paymentId: result.paymentId },
      select: { studentId: true },
    });
    if (alloc) invalidateStudentFeeReadCaches({ studentId: alloc.studentId, schoolId });
    console.log("written");
  } else {
    console.log("This is what --apply would do. Re-run with --apply to make the change.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
