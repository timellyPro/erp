export function OfflinePaymentAmountPreview({
  amount,
  setAmount,
  numericAmount,
  remainingFee,
  preview,
  headOptions,
}: {
  amount: string;
  setAmount: (v: string) => void;
  numericAmount: number;
  remainingFee: number;
  preview: { items: Array<{ key: string; dueBefore: number; dec: number; dueAfter: number }> } | null;
  headOptions: Array<{ key: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-xs text-white/70 mb-1">Amount (₹)</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white"
        placeholder="0.00"
      />
      {numericAmount > 0 && numericAmount > remainingFee + 0.01 ? (
        <p className="text-xs text-amber-400 mt-2">
          Max allowed: ₹{remainingFee.toFixed(0).toLocaleString()}
        </p>
      ) : null}
      {preview ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold">Decrease Preview</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Amount: ₹{numericAmount.toFixed(0).toLocaleString()}
          </p>
          <div className="mt-3 space-y-2">
            {preview.items.map((it) => {
              const label = headOptions.find((h) => h.key === it.key)?.label ?? it.key;
              return (
                <div key={it.key} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-gray-200 truncate">{label}</span>
                  <div className="text-right">
                    <div className="text-emerald-400 font-medium">
                      -₹{it.dec.toFixed(0).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Due after: ₹{it.dueAfter.toFixed(0).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
