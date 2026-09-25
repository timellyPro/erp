import { normalizeFeeAllocationKey } from "@/lib/feeAllocationKeys";
import { roundRupee } from "@/lib/formatRupee";

export type ExistingPaymentAllocation = {
  headType: string;
  componentIndex: number | null;
  extraFeeId: string | null;
  allocatedAmount: number;
};

export type RequestedAllocation = {
  key: string;
  amount: number;
};

export type SameRefPaymentPlan =
  | { kind: "duplicate" }
  | {
      kind: "append";
      appendTotal: number;
      deltas: Array<{ key: string; amount: number }>;
    };

/** Map a stored allocation row to a breakdown/sheet key (`BASE:n` / `EXTRA:id`). */
export function allocationKeyFromRecord(allocation: ExistingPaymentAllocation): string | null {
  if (allocation.headType === "EXTRA_FEE" && allocation.extraFeeId) {
    return normalizeFeeAllocationKey(`EXTRA:${allocation.extraFeeId}`);
  }
  if (allocation.headType === "BASE_COMPONENT" && allocation.componentIndex != null) {
    return normalizeFeeAllocationKey(`BASE:${allocation.componentIndex}`);
  }
  return null;
}

function sumExistingByKey(allocations: ExistingPaymentAllocation[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of allocations) {
    const key = allocationKeyFromRecord(row);
    if (!key) continue;
    totals.set(key, roundRupee((totals.get(key) ?? 0) + row.allocatedAmount));
  }
  return totals;
}

/**
 * When staff reuses a UTR/reference:
 * - exact duplicate request → no-op
 * - new fee heads (or additional amount on a head) → append to the existing payment
 */
export function planSameRefPayment(
  existingAllocations: ExistingPaymentAllocation[],
  requested: RequestedAllocation[]
): SameRefPaymentPlan {
  const existingByKey = sumExistingByKey(existingAllocations);
  const deltas: Array<{ key: string; amount: number }> = [];

  for (const req of requested) {
    const key = normalizeFeeAllocationKey(req.key);
    const amount = roundRupee(Number(req.amount) || 0);
    if (amount <= 0) continue;

    const already = existingByKey.get(key) ?? 0;
    const delta = roundRupee(amount - already);
    if (delta > 0.01) {
      deltas.push({ key, amount: delta });
    }
  }

  if (deltas.length === 0) {
    return { kind: "duplicate" };
  }

  const appendTotal = roundRupee(deltas.reduce((sum, d) => sum + d.amount, 0));
  return { kind: "append", appendTotal, deltas };
}
