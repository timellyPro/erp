/** Whole rupees only — no paise decimals in UI. */
export function roundRupee(n: number): number {
  return Math.round(Number(n) || 0);
}

export function formatRupee(n: number): string {
  return roundRupee(n).toLocaleString("en-IN");
}
