type ProgressRow = {
  key: string;
  feeType: string;
  amount: number;
  paid: number;
  due: number;
};

export function FeePaymentProgressSection({
  paidPercentage,
  headsLoading,
  paymentProgressRows,
  feeBreakdown,
}: {
  paidPercentage: number;
  headsLoading: boolean;
  paymentProgressRows: ProgressRow[];
  feeBreakdown: Map<string, { amount: number; paidAmount: number }>;
}) {
  return (
    <>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-300">Payment Progress</p>
          <p className="text-sm text-gray-400">{Math.round(paidPercentage)}%</p>
        </div>
        <div className="w-full h-3 bg-black/30 rounded-full overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-lime-400 to-green-400 transition-all duration-500"
            style={{ width: `${paidPercentage}%` }}
          />
        </div>
      </div>

      {/* Fee head progress — one row per configured fee head */}
      {headsLoading ? (
        <div className="text-center py-8 text-gray-500 text-sm">Loading fee breakdown…</div>
      ) : paymentProgressRows.length > 0 ? (
        <div className="overflow-x-auto overflow-y-hidden -mx-1 overscroll-x-contain pb-1 sm:mx-0">
          <table className="w-full text-left min-w-[480px] sm:min-w-0">
            <thead>
              <tr className="text-[11px] text-gray-400 font-bold tracking-wider uppercase border-b border-white/5">
                <th className="pb-4 font-medium">Fee Type</th>
                <th className="pb-4 font-medium text-right">Amount</th>
                <th className="pb-4 font-medium text-right">Paid</th>
                <th className="pb-4 font-medium text-right">Remaining</th>
                <th className="pb-4 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {paymentProgressRows.map((row) => {
                const percentage = row.amount > 0 ? (row.paid / row.amount) * 100 : 0;
                return (
                  <tr
                    key={row.key}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-4 sm:py-5 font-semibold text-gray-100">{row.feeType}</td>
                    <td className="py-4 sm:py-5 text-right text-gray-400">
                      ₹{row.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-right font-semibold text-lime-400">
                      ₹{row.paid.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-right text-gray-400">
                      ₹{row.due.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-right">
                      <span className={`${percentage >= 100 ? "text-lime-400" : "text-amber-400"} font-semibold`}>
                        {Math.round(percentage)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : feeBreakdown.size > 0 ? (
        <div className="overflow-x-auto overflow-y-hidden -mx-1 overscroll-x-contain pb-1 sm:mx-0">
          <table className="w-full text-left min-w-[480px] sm:min-w-0">
            <thead>
              <tr className="text-[11px] text-gray-400 font-bold tracking-wider uppercase border-b border-white/5">
                <th className="pb-4 font-medium">Fee Type</th>
                <th className="pb-4 font-medium text-right">Paid</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {Array.from(feeBreakdown.entries()).map(([feeType, data]) => (
                <tr key={feeType} className="border-b border-white/5 last:border-0">
                  <td className="py-4 font-semibold text-gray-100">{feeType}</td>
                  <td className="py-4 text-right font-semibold text-lime-400">
                    ₹{data.paidAmount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 text-sm">No fee breakdown data available yet.</div>
      )}

      {/* Payment Status */}
      <div className="mt-8 pt-6 border-t border-white/10">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-4">Payment Status Legend</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-lime-400" />
            <span className="text-gray-300">Fully Paid</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-gray-300">Partial Payment</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-300">Not Paid</span>
          </div>
        </div>
      </div>
    </>
  );
}
