import { canonicalExtraFeeBaseName, installmentIndexFromName } from "@/lib/extraFeeInstallments";

type HeadRow = { key: string; extraFeeId?: string; label: string };

type ExtraFeeMeta = { id: string; name: string };

/**
 * Payments may reference a deleted lump extra-fee id while breakdown shows installment rows.
 * Roll orphan EXTRA allocations onto matching installment heads (same base + 1st/2nd).
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

  const matchHeadKey = (extraFeeId: string): string | null => {
    if (headByExtraId.has(extraFeeId)) return headByExtraId.get(extraFeeId)!;
    const meta = extraFeesById.get(extraFeeId);
    if (!meta) return null;
    const base = canonicalExtraFeeBaseName(meta.name).toLowerCase();
    const idx = installmentIndexFromName(meta.name);
    if (!idx) return null;
    const candidate = heads.find((h) => {
      if (!h.extraFeeId) return false;
      const hm = extraFeesById.get(h.extraFeeId);
      if (!hm) return false;
      return (
        canonicalExtraFeeBaseName(hm.name).toLowerCase() === base &&
        installmentIndexFromName(hm.name) === idx
      );
    });
    return candidate?.key ?? null;
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
    const targetKey = matchHeadKey(extraId);
    if (!targetKey) continue;
    netPaidByHead.set(targetKey, (netPaidByHead.get(targetKey) ?? 0) + amount);
    netPaidByHead.delete(orphanKey);
  }
}
