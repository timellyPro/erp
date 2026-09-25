export type SchoolAnalysisClass = {
  id: string;
  name: string;
  section: string | null;
};

export type SchoolAnalysisFeeCollectionRow = {
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

export type SchoolAnalysisEnrollmentRow = {
  classId: string;
  className: string;
  section: string | null;
  male: number;
  female: number;
  total: number;
};

export type SchoolAnalysisAdmissionRow = {
  classLabel: string;
  existingDayScholarMale: number;
  existingDayScholarFemale: number;
  existingHostelMale: number;
  existingHostelFemale: number;
  newDayScholarMale: number;
  newDayScholarFemale: number;
  newHostelMale: number;
  newHostelFemale: number;
};

export type SchoolAnalysisAdmissionTotals = Omit<SchoolAnalysisAdmissionRow, "classLabel">;

export type SchoolAnalysisPayload = {
  availableYears: number[];
  classes?: SchoolAnalysisClass[];
  selectedYear: number;
  enrollmentByClassSection?: SchoolAnalysisEnrollmentRow[];
  enrollmentByClassSectionTotals?: { male: number; female: number; total: number };
  admissionComparison?: SchoolAnalysisAdmissionRow[];
  admissionComparisonTotals?: SchoolAnalysisAdmissionTotals;
  feeCollectionByClass?: SchoolAnalysisFeeCollectionRow[];
  feeCollectionTotals?: Omit<SchoolAnalysisFeeCollectionRow, "classId">;
  stats: {
    feesCollected: number;
    totalEnrollment: number;
    avgTeacherRating: number;
    avgExamScore: number;
  };
  charts: {
    monthlyFeesCollection: { month: string; amount: number }[];
    enrollmentGrowth: { year: number; count: number }[];
    attendance: { students: number; teachers: number };
    subjectPerformance: { subject: string; percentage: number }[];
  };
  topTeachers: { id: string; name: string; subject: string; rating: number }[];
};

export type SchoolAnalysisTablesPayload = Pick<
  SchoolAnalysisPayload,
  | "enrollmentByClassSection"
  | "enrollmentByClassSectionTotals"
  | "admissionComparison"
  | "admissionComparisonTotals"
  | "feeCollectionByClass"
  | "feeCollectionTotals"
  | "classes"
>;
