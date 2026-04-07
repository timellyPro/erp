"use client";

import { useState } from "react";
import { DollarSign, Tag, AlertCircle } from "lucide-react";

type Props = {
  studentId: string;
  currentTotalFee: number;
  currentDiscountPercent: number;
  onClose: () => void;
  onSuccess: () => void;
};

export const ModifyFeeModal = ({
  studentId,
  currentTotalFee,
  currentDiscountPercent,
  onClose,
  onSuccess,
}: Props) => {
  const [totalFee, setTotalFee] = useState<string>(String(currentTotalFee));
  const initialDiscountAmount = (currentTotalFee * (currentDiscountPercent / 100)).toFixed(2);
  const [discountAmount, setDiscountAmount] = useState<string>(initialDiscountAmount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    try {
      setLoading(true);
      const res = await fetch(`/api/fees/student/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalFee: feeAmount, discountPercent: calculatedDiscountPercent }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to update fee");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const parsedFee = parseFloat(totalFee || "0");
  const parsedDiscount = parseFloat(discountAmount || "0");
  const currentFinalFee = parsedFee - parsedDiscount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0F172A] border border-white/10 rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl relative">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-2">Modify Fee Setup</h2>
          <p className="text-gray-400 text-sm mb-6">
            Update this student's tuition fee amount and discount amount. Class/global fee heads stay separate.
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
