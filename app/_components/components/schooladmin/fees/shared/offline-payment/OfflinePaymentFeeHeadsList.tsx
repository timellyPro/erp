import type { SelectedHead } from "./useOfflinePaymentFormState";

export function OfflinePaymentFeeHeadsList({
  headOptions,
  selectedHeads,
  dueByKey,
  studentId,
  getHeadKey,
  onToggleHead,
}: {
  headOptions: Array<{ key: string; label: string; head: SelectedHead }>;
  selectedHeads: SelectedHead[];
  dueByKey: Map<string, number>;
  studentId: string;
  getHeadKey: (head: SelectedHead) => string;
  onToggleHead: (head: SelectedHead) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="px-4 py-3 bg-white/5 border-b border-white/10">
        <p className="text-sm font-semibold">Fee Heads</p>
        <p className="text-xs text-gray-400">Select which fees to reduce</p>
      </div>
      <div className="p-4 max-h-44 overflow-y-auto space-y-2">
        {headOptions.length === 0 ? (
          <p className="text-sm text-gray-500">Select class and student to load fee heads</p>
        ) : (
          headOptions.map((h) => {
            const checked = selectedHeads.some((x) => getHeadKey(x) === h.key);
            return (
              <label
                key={h.key}
                className="flex items-center justify-between gap-3 text-sm px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block text-gray-200 truncate">{h.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Due: ₹{(dueByKey.get(h.key) ?? 0).toFixed(0).toLocaleString()}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleHead(h.head)}
                  className="rounded border-white/30 w-4 h-4 accent-lime-500"
                  disabled={!studentId}
                />
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
