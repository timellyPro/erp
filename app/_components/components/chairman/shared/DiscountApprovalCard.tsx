import { CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
import { classLabel, formatMoney, type ApprovalRow } from "./discountApprovalsCache";

export function DiscountApprovalCard({
  approval,
  busyId,
  reviewRemarks,
  setReviewRemarks,
  onReview,
}: {
  approval: ApprovalRow;
  busyId: string | null;
  reviewRemarks: Record<string, string>;
  setReviewRemarks: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onReview: (id: string, action: "APPROVE" | "REJECT" | "REVERT") => void;
}) {
  const discountAmount =
    approval.discountFixedAmount ?? Math.max(approval.totalFee - approval.finalFee, 0);

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-lime-400/20 bg-white/5 p-4 shadow-xl backdrop-blur-xl sm:p-5">
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black text-white">
              {approval.student.user?.name || "Student"}
            </h2>
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-200">
              {classLabel(approval)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/55">
              {approval.student.admissionNumber}
            </span>
          </div>
          <p className="mt-4 text-sm text-white/55">
            Requested by {approval.requestedBy?.name || approval.requestedBy?.email || "-"} on{" "}
            {new Date(approval.createdAt).toLocaleDateString("en-IN")}
          </p>
          <p className="mt-2 text-sm text-white/55">
            Head: <span className="font-semibold text-lime-200">{approval.discountFeeHeadLabel || "Overall"}</span>
          </p>
          {approval.discountRemarks ? (
            <p className="mt-1 text-sm text-white/55">Reason: <span className="text-white/70">{approval.discountRemarks}</span></p>
          ) : null}
        </div>

        <div className="grid min-w-full grid-cols-2 gap-2 text-sm sm:min-w-[300px]">
          <div className="rounded-2xl bg-black/20 p-3">
            <p className="text-white/50">Total Fee</p>
            <p className="font-semibold text-white">{formatMoney(approval.totalFee)}</p>
          </div>
          <div className="rounded-2xl bg-black/20 p-3">
            <p className="text-white/50">Discount</p>
            <p className="font-semibold text-amber-200">
              {formatMoney(discountAmount)} ({approval.discountPercent.toFixed(2)}%)
            </p>
          </div>
          <div className="rounded-2xl bg-black/20 p-3">
            <p className="text-white/50">Final Fee</p>
            <p className="font-semibold text-lime-200">{formatMoney(approval.finalFee)}</p>
          </div>
          <div className="rounded-2xl bg-black/20 p-3">
            <p className="text-white/50">Status</p>
            <p className="font-black text-amber-200">{approval.status}</p>
          </div>
        </div>
      </div>

      {approval.status === "PENDING" ? (
        <div className="relative mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
          <input
            value={reviewRemarks[approval.id] || ""}
            onChange={(e) =>
              setReviewRemarks((prev) => ({ ...prev, [approval.id]: e.target.value }))
            }
            placeholder="Chairman remarks (optional)"
            className="min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-lime-400/70"
          />
          <button
            type="button"
            disabled={busyId === approval.id}
            onClick={() => onReview(approval.id, "APPROVE")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-400 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-lime-950/25 disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </button>
          <button
            type="button"
            disabled={busyId === approval.id}
            onClick={() => onReview(approval.id, "REJECT")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/25 disabled:opacity-60"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
        </div>
      ) : (
        <div className="relative mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
            Reviewed by {approval.reviewedBy?.name || approval.reviewedBy?.email || "-"}
            {approval.reviewedAt ? ` on ${new Date(approval.reviewedAt).toLocaleDateString("en-IN")}` : ""}
            {approval.reviewRemarks ? `: ${approval.reviewRemarks}` : ""}
          </div>
          {approval.status === "APPROVED" ? (
            <button
              type="button"
              disabled={busyId === approval.id}
              onClick={() => onReview(approval.id, "REVERT")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/15 px-4 py-3 text-sm font-bold text-amber-100 hover:bg-amber-400/25 disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" />
              Revert Discount
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
