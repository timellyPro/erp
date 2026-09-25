import { formatFeeHeadDisplayLabel } from "@/lib/feeHeadInstallmentDisplay";

export type PaymentFeeHeadLine = { name: string; amount: number };

type AllocationRow = {
  paymentId: string;
  headType: string;
  componentIndex: number | null;
  componentName: string | null;
  extraFeeId: string | null;
  allocatedAmount: number;
};

/** Raw fee head name before display formatting (e.g. for DB snapshots). */
export function rawExtraFeeAllocationName(
  a: Pick<AllocationRow, "componentName" | "extraFeeId">,
  extraFeeNameById: Map<string, string>
): string {
  if (a.extraFeeId) {
    const fromId = extraFeeNameById.get(a.extraFeeId)?.trim();
    if (fromId) return fromId;
  }
  const snap = a.componentName?.trim();
  if (snap) return snap;
  return "Extra Fee";
}

export function labelForPaymentAllocation(
  a: Pick<AllocationRow, "headType" | "componentIndex" | "componentName" | "extraFeeId">,
  extraFeeNameById: Map<string, string>
): string | null {
  if (a.headType === "BASE_COMPONENT") {
    if (a.componentName) return a.componentName;
    if (typeof a.componentIndex === "number") return `Component ${a.componentIndex + 1}`;
    return "Base Component";
  }
  if (a.headType === "EXTRA_FEE") {
    return formatFeeHeadDisplayLabel(rawExtraFeeAllocationName(a, extraFeeNameById));
  }
  return null;
}

export function buildFeeHeadAmountsByPaymentId(
  paymentAllocations: AllocationRow[],
  extraFeeNameById: Map<string, string>
): Map<string, Map<string, number>> {
  const feeHeadAmountsByPaymentId = new Map<string, Map<string, number>>();

  for (const a of paymentAllocations) {
    if (a.allocatedAmount <= 0.00001) continue;
    const label = labelForPaymentAllocation(a, extraFeeNameById);
    if (!label) continue;

    const perPayment = feeHeadAmountsByPaymentId.get(a.paymentId) ?? new Map<string, number>();
    feeHeadAmountsByPaymentId.set(a.paymentId, perPayment);
    perPayment.set(label, (perPayment.get(label) ?? 0) + a.allocatedAmount);
  }

  return feeHeadAmountsByPaymentId;
}

export function feeHeadLinesFromMap(
  headMap: Map<string, number> | undefined
): PaymentFeeHeadLine[] {
  if (!headMap) return [];
  return Array.from(headMap.entries())
    .filter(([, amount]) => amount > 0.00001)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({
      name,
      amount: Math.round(amount * 100) / 100,
    }));
}

export function dominantFeeHead(
  headMap: Map<string, number> | undefined
): PaymentFeeHeadLine | undefined {
  return feeHeadLinesFromMap(headMap)[0];
}
