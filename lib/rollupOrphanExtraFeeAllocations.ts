import { canonicalExtraFeeBaseName, installmentIndexFromName } from "@/lib/extraFeeInstallments";

type HeadRow = {
  key: string;
  extraFeeId?: string;
  label: string;
  /** Cap for lump → installment fill (defaults to unlimited if omitted). */
  snapshotDue?: number;
};

type ExtraFeeMeta = { id: string; name: string };

function headDisplayName(h: HeadRow, extraFeesById: Map<string, ExtraFeeMeta>): string {
  if (h.extraFeeId) {
    const meta = extraFeesById.get(h.extraFeeId);
    if (meta?.name) return meta.name;
  }
  return h.label;
}

/**
 * Payments may reference a deleted lump / legacy extra-fee id while breakdown shows installment rows.
 * Roll orphan EXTRA allocations onto matching installment heads (same base + 1st/2nd).
 * Lump orphans (no installment in the name) fill 1st then 2nd by remaining capacity.
 */
export function rollupOrphanExtraFeeAllocations(
  netPaidByHead: Map<string, number>,
  heads: HeadRow[],
  extraFeesById: Map<string, ExtraFeeMeta>
): void {
  const headByExtraId = new Map<string, string>();
  for (const h of heads) {
    if (h.extraFeeId) headByExtraId.set(h.extraFeeId, h.key);
  }

  const headsForBase = (base: string): HeadRow[] => {
    const baseNorm = base.toLowerCase();
    return heads
      .filter((h) => {
        if (!h.extraFeeId) return false;
        return (
          canonicalExtraFeeBaseName(headDisplayName(h, extraFeesById)).toLowerCase() === baseNorm
        );
      })
      .sort((a, b) => {
        const ia = installmentIndexFromName(headDisplayName(a, extraFeesById)) ?? 99;
        const ib = installmentIndexFromName(headDisplayName(b, extraFeesById)) ?? 99;
        return ia - ib;
      });
  };

  const matchExactInstallment = (base: string, idx: 1 | 2): string | null => {
    const candidate = headsForBase(base).find((h) => {
      return installmentIndexFromName(headDisplayName(h, extraFeesById)) === idx;
    });
    return candidate?.key ?? null;
  };

  /** Fill installment heads in order (1st then 2nd), respecting remaining capacity. */
  const distributeOntoBaseHeads = (base: string, amount: number): number => {
    let remaining = amount;
    const targets = headsForBase(base);
    if (targets.length === 0) return remaining;

    for (const h of targets) {
      if (Math.abs(remaining) < 1e-8) break;
      const already = netPaidByHead.get(h.key) ?? 0;
      const cap =
        h.snapshotDue != null && Number.isFinite(h.snapshotDue)
          ? Math.max(h.snapshotDue - already, 0)
          : Number.POSITIVE_INFINITY;
      if (cap <= 1e-8 && Number.isFinite(cap)) continue;
      const take = Number.isFinite(cap) ? Math.min(remaining, cap) : remaining;
      if (Math.abs(take) < 1e-8) continue;
      netPaidByHead.set(h.key, already + take);
      remaining -= take;
    }

    // Overflow (overpay): put remainder on the last matching head
    if (Math.abs(remaining) > 1e-8 && targets.length > 0) {
      const last = targets[targets.length - 1]!;
      netPaidByHead.set(last.key, (netPaidByHead.get(last.key) ?? 0) + remaining);
      remaining = 0;
    }
    return remaining;
  };

  const matchOrDistribute = (extraFeeId: string, amount: number): boolean => {
    if (headByExtraId.has(extraFeeId)) {
      const key = headByExtraId.get(extraFeeId)!;
      netPaidByHead.set(key, (netPaidByHead.get(key) ?? 0) + amount);
      return true;
    }
    const meta = extraFeesById.get(extraFeeId);
    if (!meta) return false;
    const base = canonicalExtraFeeBaseName(meta.name).toLowerCase();
    if (!base) return false;
    const idx = installmentIndexFromName(meta.name);
    if (idx) {
      const targetKey = matchExactInstallment(base, idx);
      if (!targetKey) return false;
      netPaidByHead.set(targetKey, (netPaidByHead.get(targetKey) ?? 0) + amount);
      return true;
    }
    // Lump / unsplit name → fill 1st then 2nd installment heads
    const leftover = distributeOntoBaseHeads(base, amount);
    return Math.abs(leftover) < 1e-8 || leftover !== amount;
  };

  const orphanKeys: string[] = [];
  for (const key of netPaidByHead.keys()) {
    if (!key.startsWith("EXTRA:")) continue;
    const id = key.slice("EXTRA:".length);
    if (headByExtraId.has(id)) continue;
    orphanKeys.push(key);
  }

  for (const orphanKey of orphanKeys) {
    const extraId = orphanKey.slice("EXTRA:".length);
    const amount = netPaidByHead.get(orphanKey) ?? 0;
    if (Math.abs(amount) < 1e-8) {
      netPaidByHead.delete(orphanKey);
      continue;
    }
    if (matchOrDistribute(extraId, amount)) {
      netPaidByHead.delete(orphanKey);
    }
  }
}
