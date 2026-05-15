import { isInstallmentFeeName, isUnsplitLumpExtraFee } from "@/lib/extraFeeInstallments";

export type SplitInstallmentHeadOptions = {
  splitIntoTwoInstallments?: boolean;
};

/**
 * True only for legacy lump rows (flag set, not yet stored as two installment records).
 * New data uses two ExtraFee rows; UI must not split again.
 */
export function shouldSplitFeeHeadIntoTwoInstallments(
  label: string,
  options?: SplitInstallmentHeadOptions
): boolean {
  if (isInstallmentFeeName(label)) return false;
  if (options?.splitIntoTwoInstallments === true) return true;
  return false;
}

export function isLegacyUnsplitLumpHead(
  label: string,
  options?: SplitInstallmentHeadOptions
): boolean {
  return shouldSplitFeeHeadIntoTwoInstallments(label, options);
}

export { isUnsplitLumpExtraFee };
