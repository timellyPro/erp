import { structureMultiplierAfterDiscount } from "@/lib/studentTuitionFromStructure";

export const DISCOUNT_HEAD_OVERALL_KEY = "__DISCOUNT_OVERALL__";

export type StudentFeeDiscountInput = {
  discountPercent: number;
  discountFeeHeadKey?: string | null;
  /** Rupee discount applied to the selected head (when not overall). */
  discountFixedAmount?: number | null;
};

export function isOverallDiscountKey(key: string | null | undefined): boolean {
  const k = key?.trim();
  return !k || k === DISCOUNT_HEAD_OVERALL_KEY;
}

/** Map stored label to BASE:n when key missing (e.g. stale cache omitted key). */
export function resolveDiscountFeeHeadKey(
  storedKey: string | null | undefined,
  storedLabel: string | null | undefined,
  baseComponents: ReadonlyArray<{ name: string }>
): string | null {
  const k = storedKey?.trim();
  if (k && !isOverallDiscountKey(k)) return k;
  const labelNorm = String(storedLabel ?? "")
    .trim()
    .toLowerCase();
  if (!labelNorm) return k ?? null;
  const idx = baseComponents.findIndex(
    (c) => c.name.trim().toLowerCase() === labelNorm
  );
  if (idx >= 0) return `BASE:${idx}`;
  return k ?? null;
}

/** Build discount input from StudentFee row (no extra DB column required). */
export function studentFeeDiscountFromRecord(
  fee: {
    discountPercent: number;
    totalFee: number;
    finalFee: number;
    discountFeeHeadKey?: string | null;
    discountFeeHeadLabel?: string | null;
  },
  baseComponents: ReadonlyArray<{ name: string }> = []
): StudentFeeDiscountInput {
  const rupee = Math.max(0, Math.round((fee.totalFee - fee.finalFee) * 100) / 100);
  const headKey = resolveDiscountFeeHeadKey(
    fee.discountFeeHeadKey,
    fee.discountFeeHeadLabel,
    baseComponents
  );
  const perHead = !isOverallDiscountKey(headKey) && rupee > 0;
  return {
    discountPercent: fee.discountPercent,
    discountFeeHeadKey: headKey,
    discountFixedAmount: perHead ? rupee : null,
  };
}

/**
 * Pre-discount structure + extras total for display; extras are never reduced by %.
 */
export function storedDiscountRupeeAmount(
  totalFee: number,
  finalFee: number,
  discountFixedAmount?: number | null
): number {
  if (typeof discountFixedAmount === "number" && discountFixedAmount > 0) {
    return Math.round(discountFixedAmount * 100) / 100;
  }
  return Math.max(0, Math.round((totalFee - finalFee) * 100) / 100);
}

function virtualInstallmentTarget(
  targetKey: string
): { baseIdx: number; inst: 1 | 2 } | null {
  const m = targetKey.match(/^BASE:(\d+)::INST([12])$/);
  if (!m) return null;
  return { baseIdx: Number(m[1]), inst: Number(m[2]) as 1 | 2 };
}

/** Snapshot due for one fee head after student discount rules. */
export function discountedSnapshotDueForHead(
  headKey: string,
  preDiscountDue: number,
  discount: StudentFeeDiscountInput
): number {
  const pre = Math.max(0, Number(preDiscountDue) || 0);
  if (pre <= 0) return 0;

  const pct = Math.min(100, Math.max(0, Number(discount.discountPercent) || 0));
  const headKeyNorm = headKey.trim();
  const targetKey = discount.discountFeeHeadKey?.trim() ?? "";

  if (pct <= 0 && !(discount.discountFixedAmount && discount.discountFixedAmount > 0)) {
    return pre;
  }

  if (isOverallDiscountKey(targetKey)) {
    return pre * structureMultiplierAfterDiscount(pct);
  }

  const virtual = virtualInstallmentTarget(targetKey);
  if (virtual) {
    const lumpKey = `BASE:${virtual.baseIdx}`;
    if (headKeyNorm !== lumpKey) return pre;
    const half = Math.round((pre / 2) * 100) / 100;
    const otherHalf = Math.round((pre - half) * 100) / 100;
    if (virtual.inst === 1) return half;
    const fixed =
      typeof discount.discountFixedAmount === "number" && discount.discountFixedAmount > 0
        ? discount.discountFixedAmount
        : otherHalf * (pct / 100);
    return Math.max(0, Math.round((otherHalf - fixed) * 100) / 100);
  }

  if (targetKey === headKeyNorm) {
    const fixed =
      typeof discount.discountFixedAmount === "number" && discount.discountFixedAmount > 0
        ? discount.discountFixedAmount
        : pre * (pct / 100);
    return Math.max(0, Math.round((pre - fixed) * 100) / 100);
  }

  return pre;
}

/** Sum of discounted snapshot dues across all heads. */
export function finalFeeFromDiscountedHeads(
  heads: ReadonlyArray<{ key: string; preDiscountDue: number }>,
  discount: StudentFeeDiscountInput
): number {
  return heads.reduce(
    (s, h) => s + discountedSnapshotDueForHead(h.key, h.preDiscountDue, discount),
    0
  );
}
