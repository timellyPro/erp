/** Strip UI installment suffixes (`::INST1`) from breakdown / sheet keys. */
export function normalizeFeeAllocationKey(raw: string): string {
  const key = raw.trim();
  if (key.startsWith("BASE:")) return key.split("::")[0]!;
  if (key.startsWith("EXTRA:")) return key.split("::")[0]!;
  return key;
}

export function extraFeeIdFromAllocationKey(raw: string): string | null {
  const key = normalizeFeeAllocationKey(raw);
  if (!key.startsWith("EXTRA:")) return null;
  const id = key.slice("EXTRA:".length).trim();
  return id.length > 0 ? id : null;
}

export function baseComponentIndexFromAllocationKey(raw: string): number | null {
  const key = normalizeFeeAllocationKey(raw);
  if (!key.startsWith("BASE:")) return null;
  const idx = Number(key.slice("BASE:".length));
  return Number.isFinite(idx) ? idx : null;
}
