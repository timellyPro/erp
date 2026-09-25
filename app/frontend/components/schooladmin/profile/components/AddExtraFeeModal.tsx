"use client";

import { useState } from "react";
import { DollarSign, Tag, AlertCircle } from "lucide-react";

type Props = {
  studentId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export const AddExtraFeeModal = ({ studentId, onClose, onSuccess }: Props) => {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [splitIntoTwoInstallments, setSplitIntoTwoInstallments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const feeAmount = parseFloat(amount);
    if (!name.trim()) {
      setError("Please enter a fee name.");
      return;
    }
    if (isNaN(feeAmount) || feeAmount <= 0) {
      setError("Please enter a valid positive fee amount.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/fees/extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          amount: feeAmount,
          targetType: "STUDENT",
          targetStudentId: studentId,
          splitIntoTwoInstallments,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to add extra fee");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0F172A] border border-white/10 rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl relative">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-2">Assign Extra Fee</h2>
          <p className="text-gray-400 text-sm mb-6">
            Add a new fee charge specifically for this student. This will increase their total due amount.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-400 text-sm rounded-xl border border-red-500/20">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Fee Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Tag className="w-5 h-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/40 border-white/10 border text-white rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                  placeholder="e.g. Late Payment Fine"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Amount (₹)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-black/40 border-white/10 border text-white rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                  placeholder="e.g. 500"
                  required
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/80">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-black/40 text-lime-500 focus:ring-lime-500/40"
                checked={splitIntoTwoInstallments}
                onChange={(e) => setSplitIntoTwoInstallments(e.target.checked)}
              />
              <span>
                <span className="font-medium text-white">Two installments (50% + 50%)</span>
                <span className="mt-0.5 block text-xs text-white/50">
                  Shows this fee as 1st and 2nd installment on the breakdown, like hostel fee.
                </span>
              </span>
            </label>

            <div className="flex items-center gap-3 pt-4">
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
                {loading ? "Adding..." : "Add Fee"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
