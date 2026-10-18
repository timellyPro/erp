/**
 * Remove ONE fee-head allocation that has no money behind it (a payment whose allocations add up to
 * more than the payment). Dry run unless --apply is given. See lib/fees/repairOverAllocatedPayment.ts.
 *
 * Usage:
 *   npx tsx scripts/repair-over-allocated-payment.ts --school-id=<id> --allocation-id=<id> --reason="..."
 *   npx tsx scripts/repair-over-allocated-payment.ts --school-id=<id> --allocation-id=<id> --reason="..." --apply
 *
 * Find the payment whose allocations exceed its amount by comparing SUM(allocatedAmount) with Payment.amount,
 * then list its allocations. Confirm with the school first, and take a backup before --apply.
 * The change is written to the payment's history (Fees > Receipt Lookup & History).
 */
import os from "os";
import prisma from "../lib/db";
import { repairOverAllocatedPayment, type RepairDb } from "@/lib/fees/repairOverAllocatedPayment";

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const schoolId = arg("school-id");
  const allocationId = arg("allocation-id");
  const reason = arg("reason") ?? "";
  const apply = process.argv.includes("--apply");

  if (!schoolId || !allocationId) {
    console.error('Usage: --school-id=<id> --allocation-id=<id> --reason="why" [--apply]');
    process.exit(2);
  }

  console.log(apply ? "APPLYING: this will delete the allocation" : "DRY RUN: nothing will be changed");
  const result = await repairOverAllocatedPayment(prisma as unknown as RepairDb, {
    schoolId,
    allocationId,
    reason,
    actor: { userId: null, name: `Maintenance script (${os.userInfo().username})`, role: "SYSTEM" },
    apply,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(`\nNot changed: ${result.reason}`);
    process.exit(1);
  }
  console.log(
    result.applied
      ? "\nDone. The payment's history now shows this change."
      : "\nThis is what --apply would do. Re-run with --apply to make the change."
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
