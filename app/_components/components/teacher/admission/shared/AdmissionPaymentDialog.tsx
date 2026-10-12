import { Loader2 } from "lucide-react";
import InputField from "../../../schooladmin/schooladmincomponents/InputField";
import { Select } from "./PresentationalBits";
import type { AdmissionRow, FeeType } from "./types";

export type PaymentFormState = {
  paymentMode: string;
  paymentMethod: string;
  referenceNo: string;
  remarks: string;
};

export function AdmissionPaymentDialog({
  dialog,
  paymentForm,
  onPaymentFormChange,
  paymentError,
  paying,
  onCancel,
  onPay,
}: {
  dialog: { row: AdmissionRow; feeType: FeeType } | null;
  paymentForm: PaymentFormState;
  onPaymentFormChange: (update: (p: PaymentFormState) => PaymentFormState) => void;
  paymentError: string | null;
  paying: boolean;
  onCancel: () => void;
  onPay: (row: AdmissionRow, feeType: FeeType) => void;
}) {
  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1220] p-5 space-y-4">
        <div className="text-white font-semibold">
          {dialog.feeType === "APPLICATION" ? "Pay Application Fee" : "Pay Admission Fee"}
        </div>
        <p className="text-sm text-white/70">
          {`${dialog.row.firstName} ${dialog.row.lastName}`}
        </p>
        {paymentError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {paymentError}
          </div>
        )}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select
              label="Payment Mode"
              value={paymentForm.paymentMode}
              onChange={(v) => onPaymentFormChange((p) => ({ ...p, paymentMode: v }))}
              options={[
                { label: "Offline", value: "OFFLINE" },
                { label: "Online", value: "ONLINE" },
              ]}
            />
            <Select
              label="Payment Method"
              value={paymentForm.paymentMethod}
              onChange={(v) => onPaymentFormChange((p) => ({ ...p, paymentMethod: v }))}
              options={[
                { label: "Cash", value: "CASH" },
                { label: "Cheque", value: "CHEQUE" },
                { label: "UPI", value: "UPI" },
                { label: "Bank Transfer", value: "BANK_TRANSFER" },
                { label: "Card", value: "CARD" },
              ]}
            />
          </div>
          {(paymentForm.paymentMethod === "UPI" || paymentForm.paymentMethod === "BANK_TRANSFER") && (
            <InputField
              label="Reference Number / UTR"
              value={paymentForm.referenceNo}
              onChange={(v) => onPaymentFormChange((p) => ({ ...p, referenceNo: v }))}
              required
            />
          )}
          <InputField
            label="Remarks"
            value={paymentForm.remarks}
            onChange={(v) => onPaymentFormChange((p) => ({ ...p, remarks: v }))}
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={paying}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onPay(dialog.row, dialog.feeType)}
            disabled={paying}
            className="px-4 py-2 rounded-xl bg-lime-400 text-black font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {paying && <Loader2 size={16} className="animate-spin" />}
            {paying ? "Processing..." : "Pay Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
