import { X } from "lucide-react";

export type PayingHead = {
  key: string;
  sourceKey?: string;
  label: string;
  due: number;
  extraFeeId?: string;
};

export type HeadPaymentForm = {
  amount: string;
  mode: "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS";
  referenceNo: string;
  paymentDate: string;
};

export function RecordHeadPaymentDialog({
  payingHead,
  paymentForm,
  onPaymentFormChange,
  paymentError,
  paymentSaving,
  onCancel,
  onSubmit,
}: {
  payingHead: PayingHead | null;
  paymentForm: HeadPaymentForm;
  onPaymentFormChange: (update: (p: HeadPaymentForm) => HeadPaymentForm) => void;
  paymentError: string | null;
  paymentSaving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  if (!payingHead) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1220] p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">Record Payment</h4>
            <p className="text-xs text-white/60 mt-1">
              {payingHead.label} • Due: ₹{payingHead.due.toLocaleString("en-IN")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !paymentSaving && onCancel()}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paymentForm.amount}
              onChange={(e) =>
                onPaymentFormChange((prev) => ({
                  ...prev,
                  amount: e.target.value,
                }))
              }
              placeholder="Enter amount"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Payment mode</label>
            <select
              value={paymentForm.mode}
              onChange={(e) =>
                onPaymentFormChange((prev) => ({
                  ...prev,
                  mode: e.target.value as HeadPaymentForm["mode"],
                }))
              }
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            >
              <option value="CASH">Cash</option>
              <option value="ONLINE">Online</option>
              <option value="CHEQUE">Cheque</option>
              <option value="DD">DD (Demand Draft)</option>
              <option value="OTHERS">Others</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Payment date</label>
            <input
              type="date"
              value={paymentForm.paymentDate}
              onChange={(e) =>
                onPaymentFormChange((prev) => ({
                  ...prev,
                  paymentDate: e.target.value,
                }))
              }
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">UTR / Reference number</label>
            <input
              value={paymentForm.referenceNo}
              onChange={(e) =>
                onPaymentFormChange((prev) => ({
                  ...prev,
                  referenceNo: e.target.value,
                }))
              }
              placeholder="Optional for cash, required for non-cash"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
        </div>

        {paymentError ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {paymentError}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !paymentSaving && onCancel()}
            disabled={paymentSaving}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={paymentSaving}
            className="rounded-xl bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50"
          >
            {paymentSaving ? "Recording..." : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
