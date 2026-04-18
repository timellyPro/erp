/**
 * Older flows allocated payments to BASE:-1 ("Tuition Fee") alongside structure rows,
 * which double-counted totals. Merge any net allocated to BASE:-1 onto real heads
 * proportionally by snapshot due so per-head paid/due stay consistent.
 */
export function redistributeBaseMinusOneAllocations(
  netPaidByHead: Map<string, number>,
  heads: ReadonlyArray<{ key: string; snapshotDue: number }>
): void {
  const orphan = netPaidByHead.get("BASE:-1") ?? 0;
  if (Math.abs(orphan) < 1e-8) {
    netPaidByHead.delete("BASE:-1");
    return;
  }
  netPaidByHead.delete("BASE:-1");
  const total = heads.reduce((s, h) => s + Math.max(0, h.snapshotDue), 0);
  if (total < 1e-8) return;
  for (const h of heads) {
    const snap = Math.max(0, h.snapshotDue);
    const add = orphan * (snap / total);
    netPaidByHead.set(h.key, (netPaidByHead.get(h.key) ?? 0) + add);
  }
}
