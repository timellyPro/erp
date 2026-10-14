import { formatRupee } from "@/lib/formatRupee";
import { DISCOUNT_HEAD_OVERALL_KEY } from "../ModifyFeeModal";
import type { DiscountApprovalSummary } from "./feesBreakdownHelpers";

type ApprovalUi = {
  label: string;
  chip: string;
  border: string;
  bg: string;
  text: string;
  dot: string;
} | null;

export function FeeSummaryCards({
  displayTotalAmount,
  displayPreDiscountTotal,
  raisedDiscountAmount,
  discountAmount,
  approvalUi,
  approvalState,
  discountFeeHeadLabel,
  discountFeeHeadKey,
  discountRemarks,
  displayAmountPaid,
  paidPercentage,
  displayRemainingAmount,
  previousYearRemainingAmount,
}: {
  displayTotalAmount: number;
  displayPreDiscountTotal: number;
  raisedDiscountAmount: number | null;
  discountAmount: number;
  approvalUi: ApprovalUi;
  approvalState: DiscountApprovalSummary[];
  discountFeeHeadLabel?: string | null;
  discountFeeHeadKey?: string | null;
  discountRemarks?: string | null;
  displayAmountPaid: number;
  paidPercentage: number;
  displayRemainingAmount: number;
  previousYearRemainingAmount: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl p-4">
        <p className="text-xs text-amber-300/70 uppercase tracking-widest font-bold">Current Year Fees</p>
        <p className="text-2xl font-bold text-white mt-2">₹{formatRupee(displayTotalAmount)}</p>
        <p className="text-xs text-amber-300 mt-1 font-semibold">
          Pre-discount: ₹{formatRupee(displayPreDiscountTotal)}
        </p>
        <p className="text-xs text-amber-300 mt-1 font-semibold">
          {raisedDiscountAmount != null ? "Raised discount" : "Discount"}: ₹
          {formatRupee(raisedDiscountAmount ?? discountAmount)}
        </p>
        {approvalUi ? (
          <p className={`text-[11px] mt-1 font-semibold ${approvalUi.text}`}>
            Status: {approvalUi.label}
          </p>
        ) : null}
        {approvalUi ? (
          <div className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${approvalUi.border} ${approvalUi.bg} ${approvalUi.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${approvalUi.dot}`} />
            <span>{approvalUi.chip}</span>
            {raisedDiscountAmount ? (
              <span>₹{formatRupee(raisedDiscountAmount)}</span>
            ) : null}
          </div>
        ) : null}
        {approvalState.length > 1 ? (
          <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Raised discount history</p>
            {approvalState.map((approval, index) => {
              const statusStyle =
                approval.status === "PENDING"
                  ? "text-sky-200"
                  : approval.status === "REJECTED"
                    ? "text-red-200"
                    : "text-lime-200";
              return (
                <div key={approval.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-amber-100/80">
                    #{index + 1} {approval.discountFeeHeadLabel || "Discount"}
                  </span>
                  <span className={`shrink-0 font-semibold ${statusStyle}`}>
                    {approval.status} · ₹{formatRupee(approval.discountFixedAmount ?? 0)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
        {(discountFeeHeadLabel?.trim() ||
          discountRemarks?.trim() ||
          discountFeeHeadKey?.trim()) ? (
          <div className="mt-2 rounded-lg border border-amber-500/25 bg-black/20 px-2.5 py-2 text-left space-y-1">
            {discountFeeHeadLabel?.trim() ? (
              <p className="text-[11px] text-amber-200/90">
                <span className="font-bold text-amber-300/80">Discount head: </span>
                {discountFeeHeadLabel}
              </p>
            ) : discountFeeHeadKey?.trim() ? (
              <p className="text-[11px] text-amber-200/90">
                <span className="font-bold text-amber-300/80">Discount head: </span>
                {discountFeeHeadKey.trim() === DISCOUNT_HEAD_OVERALL_KEY
                  ? "Overall / consolidated"
                  : discountFeeHeadKey}
              </p>
            ) : null}
            {discountRemarks?.trim() ? (
              <p className="text-[11px] text-amber-200/80 leading-snug">
                <span className="font-bold text-amber-300/80">Remarks: </span>
                {discountRemarks}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="bg-lime-400/10 border border-lime-400/20 rounded-xl p-4">
        <p className="text-xs text-lime-300/70 uppercase tracking-widest font-bold">Current Year Paid</p>
        <p className="text-2xl font-bold text-white mt-2">₹{formatRupee(displayAmountPaid)}</p>
        <p className="text-xs text-lime-400 mt-1 font-semibold">{Math.round(paidPercentage)}% Paid</p>
      </div>

      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <p className="text-xs text-red-300/70 uppercase tracking-widest font-bold">Current Year Due</p>
        <p className="text-2xl font-bold text-white mt-2">₹{formatRupee(displayRemainingAmount)}</p>
        <p className="text-xs text-red-400 mt-1 font-semibold">
          {Math.round(100 - paidPercentage)}% Pending
        </p>
      </div>

      <div className="bg-orange-400/10 border border-orange-400/20 rounded-xl p-4">
        <p className="text-xs text-orange-300/70 uppercase tracking-widest font-bold">Previous Year Due</p>
        <p className="text-2xl font-bold text-white mt-2">₹{formatRupee(previousYearRemainingAmount)}</p>
        <p className="text-xs text-orange-300 mt-1 font-semibold">Kept separate from current fees</p>
      </div>
    </div>
  );
}
