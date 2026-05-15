"use client";

import { useMemo, useState } from "react";
import { DollarSign, Tag, AlertCircle, ListTree, FileText } from "lucide-react";

export type FeeHeadOption = { key: string; label: string };

/** Sentinel stored when no class breakdown head applies; still requires remarks when discount &gt; 0. */
export const DISCOUNT_HEAD_OVERALL_KEY = "__DISCOUNT_OVERALL__";

type Props = {
  studentId: string;
  currentTotalFee: number;
  currentDiscountPercent: number;
  /** Fee heads from admin breakdown (BASE:n / EXTRA:id). */
  feeHeadOptions: FeeHeadOption[];
  initialDiscountFeeHeadKey?: string | null;
  initialDiscountFeeHeadLabel?: string | null;
  initialDiscountRemarks?: string | null;
  initialDiscountFixedAmount?: number | null;
  onClose: () => void;
  onSuccess: () => void;
};

export const ModifyFeeModal = ({
  studentId,
  currentTotalFee,
  currentDiscountPercent,
  feeHeadOptions,
  initialDiscountFeeHeadKey,
  initialDiscountFeeHeadLabel,
  initialDiscountRemarks,
  initialDiscountFixedAmount,
  onClose,
  onSuccess,
}: Props) => {
  const [totalFee, setTotalFee] = useState<string>(String(currentTotalFee));
  const initialDiscountAmount = (
    typeof initialDiscountFixedAmount === "number" && initialDiscountFixedAmount > 0
      ? initialDiscountFixedAmount
      : currentTotalFee * (currentDiscountPercent / 100)
  ).toFixed(2);
  const [discountAmount, setDiscountAmount] = useState<string>(initialDiscountAmount);
  const [discountHeadKey, setDiscountHeadKey] = useState<string>(initialDiscountFeeHeadKey?.trim() ?? "");
  const [remarks, setRemarks] = useState<string>(initialDiscountRemarks ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const headSelectOptions = useMemo(() => {
    const overall: FeeHeadOption = {
      key: DISCOUNT_HEAD_OVERALL_KEY,
      label: "Overall / consolidated (not tied to one fee head)",
    };
    const opts = [overall, ...feeHeadOptions];
    const k = initialDiscountFeeHeadKey?.trim();
    if (k && !opts.some((o) => o.key === k)) {
      opts.push({
        key: k,
        label: `${initialDiscountFeeHeadLabel?.trim() || k} (saved)`,
      });
    }
    return opts;
  }, [feeHeadOptions, initialDiscountFeeHeadKey, initialDiscountFeeHeadLabel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const feeAmount = parseFloat(totalFee);
    const discountAmt = parseFloat(discountAmount);

    if (isNaN(feeAmount) || feeAmount <= 0) {
      setError("Please enter a valid positive base fee.");
      return;
    }
    if (isNaN(discountAmt) || discountAmt < 0 || discountAmt > feeAmount) {
      setError("Discount amount cannot be negative or greater than the total fee.");
      return;
    }

    const calculatedDiscountPercent = feeAmount > 0 ? (discountAmt / feeAmount) * 100 : 0;
    const hasDiscount = calculatedDiscountPercent > 0;

    if (hasDiscount) {
      if (!discountHeadKey.trim()) {
        setError("Select the fee head this discount applies to.");
        return;
      }
      const r = remarks.trim();
      if (r.length < 3) {
        setError("Enter remarks / approval authority for this discount (at least 3 characters).");
        return;
      }
    }

    const keyTrim = discountHeadKey.trim();
    let selectedLabel =
      headSelectOptions.find((o) => o.key === keyTrim)?.label ?? keyTrim;
    if (selectedLabel.endsWith(" (saved)")) {
      selectedLabel = selectedLabel.slice(0, selectedLabel.length - " (saved)".length);
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/fees/student/${studentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalFee: feeAmount,
          discountPercent: calculatedDiscountPercent,
          discountFixedAmount: hasDiscount ? discountAmt : null,
          ...(hasDiscount
            ? {
                discountFeeHeadKey: discountHeadKey.trim(),
                discountFeeHeadLabel: selectedLabel,
                discountRemarks: remarks.trim(),
              }
            : {
                discountFeeHeadKey: null,
                discountFeeHeadLabel: null,
                discountRemarks: null,
              }
          ),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to update fee");
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const parsedFee = parseFloat(totalFee || "0");
  const parsedDiscount = parseFloat(discountAmount || "0");
  const currentFinalFee = parsedFee - parsedDiscount;
  const showDiscountMeta = parsedDiscount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0F172A] border border-white/10 rounded-[2rem] w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl relative">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-2">Modify Fee Setup</h2>
          <p className="text-gray-400 text-sm mb-6">
            Update this student&apos;s tuition fee amount and discount. When a discount applies, specify which fee
            head it relates to and record approval / remarks.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-400 text-sm rounded-xl border border-red-500/20">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Tuition Fee Amount (₹)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalFee}
                  onChange={(e) => setTotalFee(e.target.value)}
                  className="w-full bg-black/40 border-white/10 border text-white rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                  placeholder="e.g. 50000"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Discount Amount (₹)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Tag className="w-5 h-5 text-gray-500" />
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="w-full bg-black/40 border-white/10 border text-white rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                  placeholder="e.g. 5000"
                  required
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 space-y-1">
              <p className="text-[11px] text-gray-400 leading-snug">
                When <span className="font-semibold text-gray-300">discount amount is greater than zero</span>, choose
                which fee head the discount applies to and record who approved it.
              </p>
              {!showDiscountMeta ? (
                <p className="text-[11px] text-amber-400/90">Increase the discount above ₹0 to enable saving head + remarks.</p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-2">
                <ListTree className="w-4 h-4 text-gray-500" />
                Discount applied to fee head
              </label>
              <select
                value={discountHeadKey}
                onChange={(e) => setDiscountHeadKey(e.target.value)}
                disabled={!showDiscountMeta}
                className="w-full bg-black/40 border-white/10 border text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">— Select fee head —</option>
                {headSelectOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Remarks / approval authority
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                disabled={!showDiscountMeta}
                placeholder="e.g. Approved by Principal — circular ref. 12/2025"
                className="w-full bg-black/40 border-white/10 border text-white rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y min-h-[5rem] placeholder:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
              <p className="text-xs text-blue-300/70 uppercase tracking-widest font-bold">Net Fee After Discount</p>
              <p className="text-2xl font-bold text-white mt-1">₹{isNaN(currentFinalFee) ? "-" : currentFinalFee.toFixed(2)}</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
