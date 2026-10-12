export function PaymentModeStep({
  showPaymentStep,
  onContinue,
  mode,
  setMode,
  referenceNo,
  setReferenceNo,
  paymentDate,
  setPaymentDate,
}: {
  showPaymentStep: boolean;
  onContinue: () => void;
  mode: "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS";
  setMode: (m: "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS") => void;
  referenceNo: string;
  setReferenceNo: (v: string) => void;
  paymentDate: string;
  setPaymentDate: (v: string) => void;
}) {
  if (!showPaymentStep) {
    return (
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-xl bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className="mb-1 block text-xs text-white/60">Payment mode</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS")}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
        >
          <option value="CASH">Cash</option>
          <option value="ONLINE">Online</option>
          <option value="CHEQUE">Cheque</option>
          <option value="DD">DD</option>
          <option value="OTHERS">Others</option>
        </select>
      </div>
      {mode !== "CASH" ? (
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-white/60">Reference / UTR</label>
          <input
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            placeholder="Enter transaction reference"
          />
        </div>
      ) : (
        <div className="md:col-span-2 flex items-end">
          <p className="text-xs text-lime-300">Cash selected: UTR not required.</p>
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs text-white/60">Payment date</label>
        <input
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
        />
      </div>
    </div>
  );
}
