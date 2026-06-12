"use client";

import { useState } from "react";
import { X } from "lucide-react";

export interface TransactionItem {
  id: string;
  amount: number;
  gateway: string;
  transactionId: string | null;
  hyperpgStatus?: string | null;
  hyperpgStatusId?: number | null;
  hyperpgTxnId?: string | null;
  hyperpgRefunded?: boolean | null;
  hyperpgAmountRefunded?: number | null;
  createdAt: string;
  collectedByName?: string | null;
  collectedByUserId?: string | null;
  student: {
    id: string;
    admissionNumber?: string;
    user?: { name: string | null; email?: string | null };
    class?: { name: string; section: string | null } | null;
  };
  refundable: number;
}

interface RefundModalProps {
  transaction: TransactionItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RefundModal({ transaction, onClose, onSuccess }: RefundModalProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!transaction) return null;

  const maxAmount = transaction.refundable;
  const amountNum = parseFloat(amount) || 0;
  const isValid = amountNum > 0 && amountNum <= maxAmount;

  const handleSubmit = async () => {
    if (!isValid) {
      alert("Enter a valid refund amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payment/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: transaction.id,
          amount: amountNum,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to process refund");
        return;
      }
      onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white">Refund Payment</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-400">
            Student: <span className="text-white font-medium">
              {transaction.student.user?.name || transaction.student.admissionNumber || "-"}
            </span>
          </p>
          <p className="text-sm text-gray-400">
            Original amount: <span className="text-emerald-400">₹{transaction.amount.toLocaleString()}</span>
          </p>
          <p className="text-sm text-gray-400">
            Max refundable: <span className="text-amber-400">₹{maxAmount.toLocaleString()}</span>
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Refund Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0}
              max={maxAmount}
              step={0.01}
              placeholder={`Up to ${maxAmount.toLocaleString()}`}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate payment"
              className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t border-white/10">
          <button
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
          >
            {saving ? "Processing..." : "Process Refund"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-white/20 text-gray-300 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
