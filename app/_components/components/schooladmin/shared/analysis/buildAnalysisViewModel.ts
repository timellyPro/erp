import { defaultAnalysisStartYear } from "@/lib/school/loadSchoolAnalysis";
import type {
  AnalysisResponse,
  GenderViewMode,
} from "./types";
import { buildAnalysisStatsAndCharts } from "./analysisStatsAndCharts";
import { buildAnalysisEnrollmentFeeRows } from "./analysisEnrollmentFeeRows";
import { buildAnalysisExports } from "./analysisExports";

/**
 * Everything computed from `data` once it's guaranteed non-null (i.e. called
 * AFTER the `if (error || !data) return` guard in Analysis.tsx). This is a
 * plain function, not a React hook — it's called conditionally, which would
 * violate the rules of hooks if it contained any useState/useEffect/etc.
 * It doesn't: this is a verbatim relocation of what were plain derived
 * consts and handler functions in the component, not hook calls.
 *
 * Split into three domain helpers (stats/charts, enrollment/fee row
 * filtering, and Excel exports) since none of them are hooks themselves —
 * they're plain synchronous/async functions, so composing them here is a
 * straightforward function call, not a hook-composition concern.
 */
export function buildAnalysisViewModel({
  data,
  year,
  classId,
  genderViewMode,
  enrollmentSearch,
  enrollmentGroupFilter,
  feeSearch,
  feeClassSectionFilter,
}: {
  data: AnalysisResponse;
  year: number;
  classId: string;
  genderViewMode: GenderViewMode;
  enrollmentSearch: string;
  enrollmentGroupFilter: string;
  feeSearch: string;
  feeClassSectionFilter: string;
}) {
  const defaultYear = defaultAnalysisStartYear();
  const selectedYear = data.selectedYear ?? year ?? defaultYear;
  const availableYears =
    data.availableYears && data.availableYears.length > 0 ? data.availableYears : [selectedYear];

  const { stats, axisStyle, feesData, enrollmentData, attendanceData, subjectData, topTeachers } =
    buildAnalysisStatsAndCharts(data);

  const {
    admissionComparisonRows,
    admissionComparisonTotals,
    enrollmentClassWiseRows,
    enrollmentSectionWiseRows,
    enrollmentGroupOptions,
    feeClassSectionOptions,
    enrollmentRowsFiltered,
    feeRowsFiltered,
    enrollmentFilteredTotals,
    feeFilteredTotals,
    feeFilteredAvgDiscountPercent,
    feeFilteredCollectionPercent,
    feeFilteredDuePercent,
  } = buildAnalysisEnrollmentFeeRows({
    data,
    genderViewMode,
    enrollmentSearch,
    enrollmentGroupFilter,
    feeSearch,
    feeClassSectionFilter,
  });

  const { formatInr, exportGenderExcel, exportAdmissionComparisonExcel, exportPaymentDetailsExcel } =
    buildAnalysisExports({
      data,
      year,
      classId,
      selectedYear,
      feeSearch,
      feeClassSectionFilter,
      enrollmentClassWiseRows,
      enrollmentSectionWiseRows,
      admissionComparisonRows,
      admissionComparisonTotals,
    });

  return {
    selectedYear,
    availableYears,
    stats,
    axisStyle,
    feesData,
    enrollmentData,
    attendanceData,
    subjectData,
    topTeachers,
    admissionComparisonRows,
    admissionComparisonTotals,
    formatInr,
    enrollmentGroupOptions,
    feeClassSectionOptions,
    enrollmentRowsFiltered,
    feeRowsFiltered,
    enrollmentFilteredTotals,
    feeFilteredTotals,
    feeFilteredAvgDiscountPercent,
    feeFilteredCollectionPercent,
    feeFilteredDuePercent,
    exportGenderExcel,
    exportAdmissionComparisonExcel,
    exportPaymentDetailsExcel,
  };
}
