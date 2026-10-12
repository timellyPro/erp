import { Users, Download } from "lucide-react";
import SelectInput from "../../../common/SelectInput";
import TimellyLoader from "../../../common/TimellyLoader";
import type { EnrollmentGroupRow, EnrollmentSectionRow, GenderViewMode } from "./types";

export function GenderEnrollmentSection({
  tablesLoading,
  enrollmentSearch,
  onEnrollmentSearchChange,
  genderViewMode,
  onGenderViewModeChange,
  enrollmentGroupFilter,
  onEnrollmentGroupFilterChange,
  enrollmentGroupOptions,
  onExportClassWise,
  onExportSectionWise,
  enrollmentRowsFiltered,
  enrollmentFilteredTotals,
}: {
  tablesLoading: boolean;
  enrollmentSearch: string;
  onEnrollmentSearchChange: (v: string) => void;
  genderViewMode: GenderViewMode;
  onGenderViewModeChange: (v: GenderViewMode) => void;
  enrollmentGroupFilter: string;
  onEnrollmentGroupFilterChange: (v: string) => void;
  enrollmentGroupOptions: string[];
  onExportClassWise: () => void;
  onExportSectionWise: () => void;
  enrollmentRowsFiltered: (EnrollmentGroupRow | EnrollmentSectionRow)[];
  enrollmentFilteredTotals: { male: number; female: number; total: number } | null;
}) {
  if (tablesLoading) {
    return (
      <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-xl border border-white/10 bg-white/5">
        <TimellyLoader
          title="Loading student strength"
          steps={["Classes", "Gender counts", "Totals"]}
          compact
          bare
        />
      </div>
    );
  }

  return (
    <div className="mt-0 sm:mt-0 rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white/10 backdrop-blur-md border border-white/10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
            <h3 className="font-semibold text-white text-sm sm:text-base">
              Students by class & section (gender)
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-white/50 mt-1 pl-0 sm:pl-7">
            Male / female counts follow the gender saved on each student; other or blank genders
            are included in total only.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <input
            type="text"
            value={enrollmentSearch}
            onChange={(e) => onEnrollmentSearchChange(e.target.value)}
            placeholder={genderViewMode === "CLASS_WISE" ? "Search class" : "Search class or section"}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-lime-400/40 sm:w-[180px] sm:text-sm"
          />
          <div className="w-full sm:w-[165px]">
            <SelectInput
              value={genderViewMode}
              onChange={(value) => {
                onGenderViewModeChange(value as GenderViewMode);
                onEnrollmentGroupFilterChange("");
              }}
              options={[
                { label: "Class-wise Table", value: "CLASS_WISE" },
                { label: "Section-wise Table", value: "SECTION_WISE" },
              ]}
            />
          </div>
          <div className="w-full sm:w-[165px]">
            <SelectInput
              value={enrollmentGroupFilter}
              onChange={onEnrollmentGroupFilterChange}
              options={[
                { label: genderViewMode === "CLASS_WISE" ? "All Classes" : "All Class & Section", value: "" },
                ...enrollmentGroupOptions.map((value) => ({ label: value, value })),
              ]}
            />
          </div>
          <button
            type="button"
            onClick={onExportClassWise}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/15 px-3 py-2 text-xs sm:text-sm font-semibold text-lime-200 hover:bg-lime-500/25 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export Class-wise Excel
          </button>
          <button
            type="button"
            onClick={onExportSectionWise}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/15 px-3 py-2 text-xs sm:text-sm font-semibold text-lime-200 hover:bg-lime-500/25 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export Section-wise Excel
          </button>
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 sm:mx-0">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {genderViewMode === "CLASS_WISE" ? (
                <th className="py-3 pr-3 font-medium">Class</th>
              ) : (
                <>
                  <th className="py-3 pr-3 font-medium">Class</th>
                  <th className="py-3 pr-3 font-medium">Section</th>
                </>
              )}
              <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Male</th>
              <th className="py-3 px-2 text-right font-medium whitespace-nowrap">Female</th>
              <th className="py-3 pl-2 text-right font-medium whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody className="text-white/90">
            {enrollmentRowsFiltered.length === 0 ? (
              <tr>
                <td colSpan={genderViewMode === "CLASS_WISE" ? 4 : 5} className="py-8 text-center text-white/40">
                  No matching class / section found.
                </td>
              </tr>
            ) : (
              enrollmentRowsFiltered.map((row) => {
                const sectionRow =
                  genderViewMode === "SECTION_WISE" ? (row as EnrollmentSectionRow) : null;
                return (
                <tr
                  key={sectionRow ? `${sectionRow.className}-${sectionRow.section}` : row.groupLabel}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                >
                  {genderViewMode === "CLASS_WISE" ? (
                    <td className="py-3 pr-3 font-semibold text-white">{row.groupLabel}</td>
                  ) : (
                    <>
                      <td className="py-3 pr-3 font-semibold text-white">
                        {sectionRow?.className ?? row.groupLabel}
                      </td>
                      <td className="py-3 pr-3 text-white/80">
                        {sectionRow?.section ?? "—"}
                      </td>
                    </>
                  )}
                  <td className="py-3 px-2 text-right tabular-nums text-sky-300">
                    {row.male.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-fuchsia-300/90">
                    {row.female.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 pl-2 text-right tabular-nums text-white font-medium">
                    {row.total.toLocaleString("en-IN")}
                  </td>
                </tr>
                );
              })
            )}
            {enrollmentFilteredTotals && enrollmentRowsFiltered.length > 0 ? (
              <tr className="border-t border-white/20 bg-white/[0.06] font-semibold">
                <td
                  className="py-3 pr-3 text-white"
                  colSpan={genderViewMode === "CLASS_WISE" ? 1 : 2}
                >
                  Filtered total
                </td>
                <td className="py-3 px-2 text-right tabular-nums text-sky-300">
                  {enrollmentFilteredTotals.male.toLocaleString("en-IN")}
                </td>
                <td className="py-3 px-2 text-right tabular-nums text-fuchsia-300">
                  {enrollmentFilteredTotals.female.toLocaleString("en-IN")}
                </td>
                <td className="py-3 pl-2 text-right tabular-nums text-white">
                  {enrollmentFilteredTotals.total.toLocaleString("en-IN")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
