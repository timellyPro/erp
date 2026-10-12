import { X } from "lucide-react";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import Spinner from "../../../common/Spinner";
import type { FeePaymentSuccess } from "./types";
import { useStudentFeesPaymentModalState, FeesSheetTable, PaymentModeStep } from "./student-fees-payment";

export function StudentFeesPaymentModal({
  studentId,
  studentName,
  initialFeeBreakdown,
  breakdownPending = false,
  onClose,
  onSuccess,
  onPaymentFailed,
}: {
  studentId: string;
  studentName: string;
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null;
  breakdownPending?: boolean;
  onClose: () => void;
  onSuccess: (result: FeePaymentSuccess) => void;
  onPaymentFailed?: (message: string) => void;
}) {
  const {
    rows,
    loading,
    saving,
    showPaymentStep,
    mode,
    setMode,
    referenceNo,
    setReferenceNo,
    paymentDate,
    setPaymentDate,
    error,
    setRowAmount,
    togglePayEntireHead,
    togglePayAllHeads,
    allPayableChecked,
    payableCount,
    total,
    totals,
    continueToPayment,
    submit,
  } = useStudentFeesPaymentModalState({
    studentId,
    initialFeeBreakdown,
    breakdownPending,
    onSuccess,
    onPaymentFailed,
  });

  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto overscroll-y-contain bg-black/70 [-webkit-overflow-scrolling:touch]">
      <div className="flex min-h-full items-start justify-center p-3 sm:items-center sm:p-4">
      <div className="my-2 w-max max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/10 bg-[#0B1220] p-4 sm:p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">Fees Sheet — {studentName}</h4>
            <p className="text-xs text-white/60 mt-1">Enter amount per head like a spreadsheet, then submit payment.</p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {rows.length === 0 && loading ? (
          <div className="py-10 text-center text-white/70"><Spinner /></div>
        ) : (
          <>
            <FeesSheetTable
              rows={rows}
              totals={totals}
              total={total}
              onSetRowAmount={setRowAmount}
              onTogglePayEntireHead={togglePayEntireHead}
              allPayableChecked={allPayableChecked}
              payableCount={payableCount}
              onTogglePayAllHeads={togglePayAllHeads}
            />

            <PaymentModeStep
              showPaymentStep={showPaymentStep}
              onContinue={continueToPayment}
              mode={mode}
              setMode={setMode}
              referenceNo={referenceNo}
              setReferenceNo={setReferenceNo}
              paymentDate={paymentDate}
              setPaymentDate={setPaymentDate}
            />

            <div className="mt-4 rounded-xl border border-lime-500/30 bg-lime-500/10 px-3 py-2 text-sm text-lime-200">
              Total to pay now: ₹{total.toLocaleString("en-IN")}
            </div>
            {error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && onClose()}
                disabled={saving}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || !showPaymentStep}
                className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50"
              >
                {saving ? "Processing..." : "Pay & Save"}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
