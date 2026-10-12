import type { DueHeadRow } from "@/lib/fees/feeBreakdownPaymentRows";

export function FeesSheetTable({
  rows,
  totals,
  total,
  onSetRowAmount,
  onTogglePayEntireHead,
  allPayableChecked,
  payableCount,
  onTogglePayAllHeads,
}: {
  rows: DueHeadRow[];
  totals: { totalAmount: number; discountAmount: number; paidAmount: number; balance: number };
  total: number;
  onSetRowAmount: (key: string, value: string) => void;
  onTogglePayEntireHead: (key: string, checked: boolean) => void;
  allPayableChecked: boolean;
  payableCount: number;
  onTogglePayAllHeads: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10">
      <table className="w-max text-sm">
        <thead className="bg-white/5 text-left text-white/70">
          <tr>
            <th className="px-3 py-2 whitespace-nowrap">Fee Type</th>
            <th className="px-2 py-2 whitespace-nowrap text-right">Total</th>
            <th className="px-2 py-2 whitespace-nowrap text-right">Discount</th>
            <th className="px-2 py-2 whitespace-nowrap text-right">Paid</th>
            <th className="px-2 py-2 whitespace-nowrap text-right">Balance</th>
            <th className="px-1 py-2 text-center whitespace-nowrap" title="Pay full balance for every fee">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer accent-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
                checked={allPayableChecked}
                disabled={payableCount === 0}
                onChange={(e) => onTogglePayAllHeads(e.target.checked)}
                aria-label="Pay full balance for every fee"
              />
            </th>
            <th className="px-2 py-2 whitespace-nowrap">Record Fee</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/5">
              <td className="px-3 py-2 text-white align-top leading-snug whitespace-nowrap">{r.label}</td>
              <td className="px-2 py-2 text-white whitespace-nowrap text-right align-top">₹{Math.round(r.totalAmount).toLocaleString("en-IN")}</td>
              <td className="px-2 py-2 text-cyan-300 whitespace-nowrap text-right align-top">₹{Math.round(r.discountAmount).toLocaleString("en-IN")}</td>
              <td className="px-2 py-2 text-lime-300 whitespace-nowrap text-right align-top">₹{Math.round(r.paidAmount).toLocaleString("en-IN")}</td>
              <td className="px-2 py-2 text-amber-300 whitespace-nowrap text-right align-top">₹{Math.round(r.dueBefore).toLocaleString("en-IN")}</td>
              <td className="px-1 py-2 text-center align-top">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
                  checked={r.payEntireHead}
                  disabled={r.dueBefore <= 0}
                  onChange={(e) => onTogglePayEntireHead(r.key, e.target.checked)}
                  aria-label={`Pay full balance for ${r.label}`}
                />
              </td>
              <td className="px-2 py-2 align-top">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={r.payAmount}
                  onChange={(e) => onSetRowAmount(r.key, e.target.value)}
                  className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-white"
                  placeholder="0.00"
                  aria-label={`Record fee for ${r.label}`}
                />
              </td>
            </tr>
          ))}
          <tr className="border-t border-white/10 bg-white/5 font-semibold">
            <td className="px-3 py-2 text-white">Total</td>
            <td className="px-2 py-2 text-white whitespace-nowrap text-right">₹{Math.round(totals.totalAmount).toLocaleString("en-IN")}</td>
            <td className="px-2 py-2 text-cyan-300 whitespace-nowrap text-right">₹{Math.round(totals.discountAmount).toLocaleString("en-IN")}</td>
            <td className="px-2 py-2 text-lime-300 whitespace-nowrap text-right">₹{Math.round(totals.paidAmount).toLocaleString("en-IN")}</td>
            <td className="px-2 py-2 text-amber-300 whitespace-nowrap text-right">₹{Math.round(totals.balance).toLocaleString("en-IN")}</td>
            <td className="px-1 py-2" />
            <td className="px-2 py-2 text-blue-300 whitespace-nowrap">₹{total.toLocaleString("en-IN")}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
