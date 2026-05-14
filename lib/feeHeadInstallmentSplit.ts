export type SplitInstallmentHeadOptions = {
  splitIntoTwoInstallments?: boolean;
};

/** True when the head should render as two 50/50 installments (explicit flag or legacy hostel/mess names). */
export function shouldSplitFeeHeadIntoTwoInstallments(
  label: string,
  options?: SplitInstallmentHeadOptions
): boolean {
  if (options?.splitIntoTwoInstallments === true) return true;
  const n = (label || "").trim().toLowerCase();
  return n === "hostel fee" || n === "mess fee";
}
