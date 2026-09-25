import { isInstallmentFeeName, isUnsplitLumpExtraFee } from "@/lib/extraFeeInstallments";
import { defaultSplitIntoTwoInstallmentsForFeeName } from "@/lib/extraFeeResidencyScope";

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
  if (defaultSplitIntoTwoInstallmentsForFeeName(label)) return true;
  return false;
}

export function isLegacyUnsplitLumpHead(
  label: string,
  options?: SplitInstallmentHeadOptions
): boolean {
  return shouldSplitFeeHeadIntoTwoInstallments(label, options);
}

export { isUnsplitLumpExtraFee };
