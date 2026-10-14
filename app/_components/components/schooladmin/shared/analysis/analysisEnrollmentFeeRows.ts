import type {
  AnalysisResponse,
  EnrollmentGroupRow,
  EnrollmentSectionRow,
  GenderViewMode,
} from "./types";

export function buildAnalysisEnrollmentFeeRows({
  data,
  genderViewMode,
  enrollmentSearch,
  enrollmentGroupFilter,
  feeSearch,
  feeClassSectionFilter,
}: {
  data: AnalysisResponse;
  genderViewMode: GenderViewMode;
  enrollmentSearch: string;
  enrollmentGroupFilter: string;
  feeSearch: string;
  feeClassSectionFilter: string;
}) {
  const feeRows = Array.isArray(data.feeCollectionByClass) ? data.feeCollectionByClass : [];
  const enrollmentRows = Array.isArray(data.enrollmentByClassSection)
    ? data.enrollmentByClassSection
    : [];
  const admissionComparisonRows = Array.isArray(data.admissionComparison) ? data.admissionComparison : [];
  const admissionComparisonTotals = data.admissionComparisonTotals;

  const enrollmentClassWiseRows: EnrollmentGroupRow[] = Array.from(
    enrollmentRows.reduce((acc, row) => {
      const key = row.className || "Unassigned";
      const item = acc.get(key) ?? { groupLabel: key, male: 0, female: 0, total: 0 };
      item.male += row.male;
      item.female += row.female;
      item.total += row.total;
      acc.set(key, item);
      return acc;
    }, new Map<string, EnrollmentGroupRow>())
  ).map(([, value]) => value).sort((a, b) => a.groupLabel.localeCompare(b.groupLabel, undefined, { numeric: true }));

  const enrollmentSectionWiseRows: EnrollmentSectionRow[] = enrollmentRows
    .map((row) => {
      const className = row.className?.trim() || "Unassigned";
      const section =
        row.section && row.section.trim() !== "" ? row.section.trim() : "Unassigned";
      return {
        groupLabel: `${className} - ${section}`,
        className,
        section,
        male: row.male,
        female: row.female,
        total: row.total,
      };
    })
    .sort((a, b) => {
      const byClass = a.className.localeCompare(b.className, undefined, { numeric: true });
      if (byClass !== 0) return byClass;
      return a.section.localeCompare(b.section, undefined, { numeric: true });
    });

  const enrollmentRowsBase =
    genderViewMode === "CLASS_WISE" ? enrollmentClassWiseRows : enrollmentSectionWiseRows;
  const enrollmentGroupOptions = enrollmentRowsBase.map((row) => row.groupLabel);

  const feeClassSectionOptions = Array.from(new Set(feeRows.map((row) => row.label))).sort((a, b) =>
    a.localeCompare(b)
  );

  const enrollmentRowsFiltered = enrollmentRowsBase.filter((row) => {
    const search = enrollmentSearch.trim().toLowerCase();
    const sectionRow = row as EnrollmentSectionRow;
    const matchesSearch =
      !search ||
      row.groupLabel.toLowerCase().includes(search) ||
      (genderViewMode === "SECTION_WISE" &&
        (sectionRow.className.toLowerCase().includes(search) ||
          sectionRow.section.toLowerCase().includes(search)));
    const matchesGroup = !enrollmentGroupFilter || row.groupLabel === enrollmentGroupFilter;
    return matchesSearch && matchesGroup;
  });

  const feeRowsFiltered = feeRows.filter((row) => {
    const search = feeSearch.trim().toLowerCase();
    const matchesSearch = !search || row.label.toLowerCase().includes(search);
    const matchesClassSection = !feeClassSectionFilter || row.label === feeClassSectionFilter;
    return matchesSearch && matchesClassSection;
  });

  const enrollmentFilteredTotals =
    enrollmentRowsFiltered.length > 0
      ? enrollmentRowsFiltered.reduce(
          (acc, row) => ({
            male: acc.male + row.male,
            female: acc.female + row.female,
            total: acc.total + row.total,
          }),
          { male: 0, female: 0, total: 0 }
        )
      : null;

  const feeFilteredTotals =
    feeRowsFiltered.length > 0
      ? feeRowsFiltered.reduce(
          (acc, row) => ({
            totalFees: acc.totalFees + row.totalFees,
            finalFees: acc.finalFees + row.finalFees,
            paidFee: acc.paidFee + row.paidFee,
            pendingFee: acc.pendingFee + row.pendingFee,
          }),
          { totalFees: 0, finalFees: 0, paidFee: 0, pendingFee: 0 }
        )
      : null;

  const feeFilteredAvgDiscountPercent =
    feeRowsFiltered.length > 0
      ? Number(
          (
            feeRowsFiltered.reduce((acc, row) => acc + row.avgDiscountPercent, 0) /
            feeRowsFiltered.length
          ).toFixed(2)
        )
      : 0;

  const feeFilteredCollectionPercent =
    feeFilteredTotals && feeFilteredTotals.finalFees > 0
      ? Number(((feeFilteredTotals.paidFee / feeFilteredTotals.finalFees) * 100).toFixed(2))
      : 0;

  const feeFilteredDuePercent =
    feeFilteredTotals && feeFilteredTotals.finalFees > 0
      ? Number(((feeFilteredTotals.pendingFee / feeFilteredTotals.finalFees) * 100).toFixed(2))
      : 0;

  return {
    feeRows,
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
  };
}
