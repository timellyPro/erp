import { Users, Download } from "lucide-react";
import TimellyLoader from "../../../common/TimellyLoader";

type AdmissionComparisonRow = {
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

export function AdmissionComparisonSection({
  tablesLoading,
  onExport,
  admissionComparisonRows,
  admissionComparisonTotals,
}: {
  tablesLoading: boolean;
  onExport: () => void;
  admissionComparisonRows: AdmissionComparisonRow[];
  admissionComparisonTotals: Omit<AdmissionComparisonRow, "classLabel"> | null | undefined;
}) {
  if (tablesLoading) {
    return (
      <div className="mt-4 flex min-h-[240px] items-center justify-center rounded-xl border border-white/10 bg-white/5">
        <TimellyLoader
          title="Loading admissions"
          steps={["Applications", "Hostel data", "Comparison"]}
          compact
          bare
        />
      </div>
    );
  }

  return (
    <div className="mt-0 sm:mt-0 rounded-xl sm:rounded-2xl p-4 sm:p-6 bg-white/10 backdrop-blur-md border border-white/10">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300 shrink-0" />
            <h3 className="font-semibold text-white text-sm sm:text-base">
              New admission comparison report
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-white/50 mt-1 pl-0 sm:pl-7">
            Existing vs new admissions by class, day scholar/hostel, and male/female.
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/15 px-3 py-2 text-xs sm:text-sm font-semibold text-lime-200 hover:bg-lime-500/25 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export to Excel
        </button>
      </div>

      <div className="-mx-1 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 sm:mx-0">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <th rowSpan={3} className="py-3 pr-3 font-medium align-bottom">Class</th>
              <th colSpan={4} className="py-3 px-2 text-center font-medium">Existing</th>
              <th colSpan={4} className="py-3 px-2 text-center font-medium">New</th>
            </tr>
            <tr className="border-b border-white/10 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <th colSpan={2} className="py-2 px-2 text-center font-medium">Day Scholar</th>
              <th colSpan={2} className="py-2 px-2 text-center font-medium">Hostel</th>
              <th colSpan={2} className="py-2 px-2 text-center font-medium">Day Scholar</th>
              <th colSpan={2} className="py-2 px-2 text-center font-medium">Hostel</th>
            </tr>
            <tr className="border-b border-white/10 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <th className="py-2 px-2 text-right font-medium">Male</th>
              <th className="py-2 px-2 text-right font-medium">Female</th>
              <th className="py-2 px-2 text-right font-medium">Male</th>
              <th className="py-2 px-2 text-right font-medium">Female</th>
              <th className="py-2 px-2 text-right font-medium">Male</th>
              <th className="py-2 px-2 text-right font-medium">Female</th>
              <th className="py-2 px-2 text-right font-medium">Male</th>
              <th className="py-2 pl-2 text-right font-medium">Female</th>
            </tr>
          </thead>
          <tbody className="text-white/90">
            {admissionComparisonRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-white/40">
                  No admission comparison data found.
                </td>
              </tr>
            ) : (
              admissionComparisonRows.map((row) => (
                <tr
                  key={row.classLabel}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="py-3 pr-3 font-semibold text-white">{row.classLabel}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-sky-300">{row.existingDayScholarMale}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-fuchsia-300/90">{row.existingDayScholarFemale}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-sky-300">{row.existingHostelMale}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-fuchsia-300/90">{row.existingHostelFemale}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-cyan-300">{row.newDayScholarMale}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-rose-300/90">{row.newDayScholarFemale}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-cyan-300">{row.newHostelMale}</td>
                  <td className="py-3 pl-2 text-right tabular-nums text-rose-300/90">{row.newHostelFemale}</td>
                </tr>
              ))
            )}
            {admissionComparisonTotals ? (
              <tr className="border-t border-white/20 bg-white/[0.06] font-semibold">
                <td className="py-3 pr-3 text-white">Total</td>
                <td className="py-3 px-2 text-right tabular-nums text-sky-300">{admissionComparisonTotals.existingDayScholarMale}</td>
                <td className="py-3 px-2 text-right tabular-nums text-fuchsia-300">{admissionComparisonTotals.existingDayScholarFemale}</td>
                <td className="py-3 px-2 text-right tabular-nums text-sky-300">{admissionComparisonTotals.existingHostelMale}</td>
                <td className="py-3 px-2 text-right tabular-nums text-fuchsia-300">{admissionComparisonTotals.existingHostelFemale}</td>
                <td className="py-3 px-2 text-right tabular-nums text-cyan-300">{admissionComparisonTotals.newDayScholarMale}</td>
                <td className="py-3 px-2 text-right tabular-nums text-rose-300">{admissionComparisonTotals.newDayScholarFemale}</td>
                <td className="py-3 px-2 text-right tabular-nums text-cyan-300">{admissionComparisonTotals.newHostelMale}</td>
                <td className="py-3 pl-2 text-right tabular-nums text-rose-300">{admissionComparisonTotals.newHostelFemale}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
