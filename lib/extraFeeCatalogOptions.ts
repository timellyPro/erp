import { groupExtraFeesForCatalogPicker, type ExtraFeeLike } from "@/lib/extraFeeInstallments";

export type CatalogFeeHeadOption = {
  key: string;
  name: string;
  amount: number;
  selected: boolean;
  scopeLabel: string;
  residencyScope: string;
  splitIntoTwoInstallments: boolean;
};

/** Build assign-fee picker options from school/class/section extras (installment pairs grouped). */
export function buildCatalogHeadOptionsFromExtras(
  catalogExtras: ExtraFeeLike[],
  formatScope: (fee: ExtraFeeLike) => string
): CatalogFeeHeadOption[] {
  const grouped = groupExtraFeesForCatalogPicker(catalogExtras);
  return grouped
    .map((x): CatalogFeeHeadOption | null => {
      const id = String(x.id ?? "");
      const name = String(x.name ?? "").trim();
      const amount = Number(x.displayAmount ?? x.amount ?? 0);
      if (!id || !name || !Number.isFinite(amount) || amount <= 0) return null;
      return {
        key: id,
        name,
        amount,
        selected: false,
        scopeLabel: formatScope(x),
        residencyScope: String(x.residencyScope ?? "ALL"),
        splitIntoTwoInstallments: Boolean(x.splitIntoTwoInstallments),
      };
    })
    .filter((h): h is CatalogFeeHeadOption => h !== null);
}

/** Drop duplicate picker cards (same name, scope, amount, residency). */
export function dedupeCatalogFeeHeadOptions(options: CatalogFeeHeadOption[]): CatalogFeeHeadOption[] {
  const seen = new Map<string, CatalogFeeHeadOption>();
  for (const option of options) {
    const key = [
      option.name.trim().toLowerCase(),
      option.scopeLabel.trim().toLowerCase(),
      String(option.amount),
      option.residencyScope,
    ].join("|");
    if (!seen.has(key)) seen.set(key, option);
  }
  return Array.from(seen.values());
}
