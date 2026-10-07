"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import PayButton from "@/app/frontend/components/common/PayButton";

interface FeeData {
  fee: {
    id: string;
    totalFee: number;
    finalFee: number;
    amountPaid: number;
    remainingFee: number;
    components: Array<{ name: string; amount: number }>;
    extraFees: Array<{ name: string; amount: number }>;
    payments: Array<{ id: string; amount: number; createdAt: string; transactionId?: string }>;
  };
}

export default function ParentFeesTab() {
  const [data, setData] = useState<FeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFee = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fees/mine");
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "Failed to load fee details");
        return;
      }
      setData(json);
    } catch (e) {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFee();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  if (error || !data?.fee) {
    return (
      <div className="min-h-[40vh] p-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
          <p className="text-amber-400">{error || "Fee details not configured. Contact your school."}</p>
        </div>
      </div>
    );
  }

  const fee = data.fee;
  const payable = Math.max(fee.remainingFee, 0);

  return (
    <div className="min-h-[40vh] p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Fee Management</h2>
        <p className="text-sm text-gray-400">View balance and pay school fees</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Total Fee</p>
          <p className="text-2xl font-bold">₹{fee.totalFee?.toLocaleString() || 0}</p>
        </div>
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Paid</p>
          <p className="text-2xl font-bold text-emerald-400">
            ₹{fee.amountPaid?.toLocaleString() || 0}
          </p>
          <p className="text-xs text-gray-500">
            {Math.round((fee.amountPaid / (fee.finalFee || 1)) * 100)}% complete
          </p>
        </div>
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-1">Remaining</p>
          <p className="text-2xl font-bold text-amber-400">
            ₹{fee.remainingFee?.toLocaleString() || 0}
          </p>
        </div>
      </div>

      {fee.remainingFee > 0 && (
        <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-xl p-6">
          <p className="text-sm text-gray-400 mb-1">Pay balance</p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-3xl font-bold text-white">₹{payable?.toLocaleString()}</p>
              <p className="text-sm text-gray-400">Amount due toward your fee balance</p>
            </div>
            <PayButton
              amount={payable}
              onSuccess={fetchFee}
              returnPath="/frontend/pages/parent?tab=fees"
            />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Instant payment • 100% secure • Get instant receipt
          </p>
        </div>
      )}

      {fee.remainingFee <= 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
          <CheckCircle className="w-8 h-8 text-emerald-400 shrink-0" />
          <div>
            <p className="font-semibold text-white">All fees paid</p>
            <p className="text-sm text-gray-400">Thank you!</p>
          </div>
        </div>
      )}

      {fee.components && fee.components.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Fee Breakdown</h3>
          <div className="space-y-2">
            {fee.components.map((c: { name: string; amount: number }, i: number) => (
              <div
                key={i}
                className="flex justify-between items-center py-2 border-b border-white/5"
              >
                <span className="text-gray-400">{c.name}</span>
                <span>₹{c.amount?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
