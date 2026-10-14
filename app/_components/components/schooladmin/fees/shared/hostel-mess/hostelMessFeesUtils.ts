import type { Class, ExtraFee } from "../../types";
import { findInstallmentPair, isUnsplitLumpExtraFee } from "@/lib/fees/extraFeeInstallments";

export function scopeLabel(scope: string | null | undefined): string {
  const s = (scope ?? "ALL").toUpperCase();
  if (s === "HOSTELLER") return "Hostel only";
  if (s === "DAY_SCHOLAR") return "Day scholars only";
  return "All students";
}

export function normName(name: string) {
  return name.trim().toLowerCase();
}

export function classLabel(c: Class) {
  return `${c.name}${c.section ? ` ${c.section}` : ""}`;
}

export type CatalogHead = {
  pair: { first: ExtraFee; second: ExtraFee } | null;
  lump: ExtraFee | null;
  single: ExtraFee | null;
};

export function resolveCatalogHead(
  fees: ExtraFee[],
  baseName: string,
  match: (e: ExtraFee) => boolean
): CatalogHead {
  const pair = findInstallmentPair(fees, baseName, match);
  if (pair) return { pair, lump: null, single: null };
  const lump =
    fees.find(
      (e) =>
        match(e) &&
        isUnsplitLumpExtraFee({
          name: e.name,
          splitIntoTwoInstallments: Boolean(e.splitIntoTwoInstallments),
        })
    ) ?? null;
  if (lump) return { pair: null, lump, single: null };
  const single =
    fees.find((e) => match(e) && normName(e.name) === normName(baseName)) ?? null;
  return { pair: null, lump: null, single };
}

export function combinedAmount(head: CatalogHead): number {
  if (head.pair) return (Number(head.pair.first.amount) || 0) + (Number(head.pair.second.amount) || 0);
  if (head.lump) return Number(head.lump.amount) || 0;
  if (head.single) return Number(head.single.amount) || 0;
  return 0;
}

export function patchTargetId(head: CatalogHead): string | null {
  if (head.pair) return head.pair.first.id;
  if (head.lump) return head.lump.id;
  if (head.single) return head.single.id;
  return null;
}

export function existingMessAmountForClass(
  extraFees: ExtraFee[],
  classHeadName: string,
  classId: string
): number {
  const head = resolveCatalogHead(
    extraFees,
    classHeadName,
    (e) => e.targetType === "CLASS" && e.targetClassId === classId
  );
  return combinedAmount(head);
}
