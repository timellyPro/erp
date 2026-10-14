import type { AnalysisSection } from "@/lib/school/loadSchoolAnalysis";
import type { SchoolAnalysisPayload } from "@/lib/school/schoolAnalysisTypes";

export type AnalysisResponse = SchoolAnalysisPayload;

export type FeeCollectionRow = {
  classId: string;
  label: string;
  totalFees: number;
  avgDiscountPercent: number;
  finalFees: number;
  paidFee: number;
  pendingFee: number;
  collectionPercent: number;
  duePercent: number;
};

export type EnrollmentByClassSectionRow = {
  classId: string;
  className: string;
  section: string | null;
  male: number;
  female: number;
  total: number;
};

export type GenderViewMode = "CLASS_WISE" | "SECTION_WISE";

export type EnrollmentGroupRow = {
  groupLabel: string;
  male: number;
  female: number;
  total: number;
};

export type EnrollmentSectionRow = EnrollmentGroupRow & {
  className: string;
  section: string;
};

export type AnalysisDashboardProps = {
  section?: AnalysisSection;
};

export type AnalysisTableSection = Extract<
  AnalysisSection,
  "gender-enrollment" | "admission-comparison" | "fee-collection"
>;
