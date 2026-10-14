export type FeesSection =
  | "overview"
  | "offline-payment"
  | "add-extra-fees"
  | "fee-structure"
  | "extra-fees-catalog"
  | "transactions"
  | "fees-records"
  | "petty-cash"
  | "student-fee-records";

export type FeesPageRequirements = {
  summary: boolean;
  /** Lighter summary (stats cards only, no fee rows). */
  statsOnly: boolean;
  /** Fast full-school fee rows for Fees Records table. */
  feeRecords: boolean;
  classes: boolean;
  students: boolean;
  structures: boolean;
  extraFees: boolean;
};

export function feesRequirementsForSection(section?: FeesSection): FeesPageRequirements {
  const s = section ?? "overview";
  switch (s) {
    case "overview":
      return {
        summary: true,
        statsOnly: true,
        feeRecords: false,
        classes: false,
        students: false,
        structures: false,
        extraFees: false,
      };
    case "offline-payment":
      return {
        summary: false,
        statsOnly: false,
        feeRecords: false,
        classes: true,
        students: true,
        structures: true,
        extraFees: true,
      };
    case "add-extra-fees":
      return {
        summary: false,
        statsOnly: false,
        feeRecords: false,
        classes: true,
        students: true,
        structures: false,
        extraFees: true,
      };
    case "fee-structure":
      return {
        summary: false,
        statsOnly: false,
        feeRecords: false,
        classes: true,
        students: false,
        structures: true,
        extraFees: false,
      };
    case "extra-fees-catalog":
      return {
        summary: false,
        statsOnly: false,
        feeRecords: false,
        classes: true,
        students: true,
        structures: false,
        extraFees: true,
      };
    case "transactions":
      return {
        summary: false,
        statsOnly: false,
        feeRecords: false,
        classes: true,
        students: false,
        structures: false,
        extraFees: false,
      };
    case "fees-records":
    case "student-fee-records":
      return {
        summary: false,
        statsOnly: false,
        feeRecords: true,
        classes: true,
        students: false,
        structures: false,
        extraFees: false,
      };
    case "petty-cash":
      return {
        summary: false,
        statsOnly: false,
        feeRecords: false,
        classes: false,
        students: false,
        structures: false,
        extraFees: false,
      };
    default:
      return {
        summary: true,
        statsOnly: true,
        feeRecords: false,
        classes: false,
        students: false,
        structures: false,
        extraFees: false,
      };
  }
}

export function feesPageReady(
  req: FeesPageRequirements,
  data: {
    stats: unknown | null;
    feeRecords: unknown[] | null;
    classes: unknown[] | null;
    students: unknown[] | null;
    structures: unknown[] | null;
    extraFees: unknown[] | null;
  }
): boolean {
  if (req.summary && data.stats === null) return false;
  if (req.feeRecords && data.feeRecords === null) return false;
  if (req.classes && data.classes === null) return false;
  if (req.students && data.students === null) return false;
  if (req.structures && data.structures === null) return false;
  if (req.extraFees && data.extraFees === null) return false;
  return true;
}
