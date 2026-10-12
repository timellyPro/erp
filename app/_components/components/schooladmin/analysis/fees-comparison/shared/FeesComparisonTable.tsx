import Spinner from "@/app/_components/components/common/Spinner";
import { formatInr, type ComparisonReport } from "./feesComparisonTypes";

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-white/50">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white scheme-dark"
      />
    </label>
  );
}

export function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueColor =
    tone === "positive" ? "text-lime-300" : tone === "negative" ? "text-rose-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">{label}</p>
      <p className={`mt-1 text-lg font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

export function FeesComparisonTable({
  report,
  loading,
  hasRows,
}: {
  report: ComparisonReport | null;
  loading: boolean;
  hasRows: boolean;
}) {
  if (loading && !report) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <SummaryCard label="Range 1 total" value={formatInr(report?.totals.rangeAAmount ?? 0)} />
        <SummaryCard label="Range 2 total" value={formatInr(report?.totals.rangeBAmount ?? 0)} />
        <SummaryCard
          label="Difference"
          value={formatInr(report?.totals.difference ?? 0)}
          tone={(report?.totals.difference ?? 0) >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-white/45">
              <th className="py-3 pr-3 font-medium">Type</th>
              <th className="px-2 py-3 font-medium">Head</th>
              <th className="px-2 py-3 text-right font-medium">Range 1</th>
              <th className="px-2 py-3 text-right font-medium">Range 2</th>
              <th className="px-2 py-3 text-right font-medium">Difference</th>
              <th className="py-3 pl-2 text-right font-medium">Count</th>
            </tr>
          </thead>
          <tbody className="text-white/90">
            {!hasRows ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-white/40">
                  No fee or petty cash data found for these ranges.
                </td>
              </tr>
            ) : (
              report?.rows.map((row) => (
                <tr key={row.key} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                  <td className="py-3 pr-3 text-xs font-semibold uppercase tracking-wide text-white/45">
                    {row.category === "PETTY_CASH" ? "Petty cash" : "Fees"}
                  </td>
                  <td className="px-2 py-3 font-semibold text-white">{row.head}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-sky-200">
                    {formatInr(row.rangeAAmount)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-lime-200">
                    {formatInr(row.rangeBAmount)}
                  </td>
                  <td
                    className={`px-2 py-3 text-right tabular-nums font-semibold ${
                      row.difference >= 0 ? "text-lime-300" : "text-rose-300"
                    }`}
                  >
                    {formatInr(row.difference)}
                  </td>
                  <td className="py-3 pl-2 text-right tabular-nums text-white/55">
                    {row.rangeACount} / {row.rangeBCount}
                  </td>
                </tr>
              ))
            )}
            {hasRows && report ? (
              <tr className="border-t border-white/20 bg-white/6 font-bold">
                <td className="py-3 pr-3 text-white">Total</td>
                <td className="px-2 py-3 text-white">All heads</td>
                <td className="px-2 py-3 text-right tabular-nums text-sky-200">
                  {formatInr(report.totals.rangeAAmount)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-lime-200">
                  {formatInr(report.totals.rangeBAmount)}
                </td>
                <td
                  className={`px-2 py-3 text-right tabular-nums ${
                    report.totals.difference >= 0 ? "text-lime-300" : "text-rose-300"
                  }`}
                >
                  {formatInr(report.totals.difference)}
                </td>
                <td className="py-3 pl-2 text-right text-white/40">-</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
