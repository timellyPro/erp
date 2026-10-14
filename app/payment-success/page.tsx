"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Receipt, ArrowLeft } from "lucide-react";

interface ReceiptData {
  paymentId: string;
  orderId: string | null;
  transactionId: string | null;
  amount: number;
  currency: string;
  status: string;
  gateway: string;
  gatewayStatus?: string | null;
  gatewayStatusId?: number | null;
  refunded?: boolean | null;
  amountRefunded?: number | null;
  createdAt: string;
  student: {
    name: string | null;
    admissionNumber: string | null;
    class: string | null;
    school: string | null;
  } | null;
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Missing order ID");
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetch(`/api/payment/receipt?order_id=${encodeURIComponent(orderId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.receipt) {
          setReceipt(data.receipt);
        } else {
          setError(data.message || "Failed to load receipt");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load receipt");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-lime-500/30 border-t-lime-500 mx-auto mb-4" />
          <p className="text-white/80">Loading receipt…</p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1a1a1a] border border-[#333] rounded-2xl p-8 text-center">
          <p className="text-red-400 font-medium mb-4">{error || "Receipt not found"}</p>
          <Link
            href="/parent?tab=fees"
            className="inline-flex items-center gap-2 text-lime-400 hover:text-lime-300"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Fees
          </Link>
        </div>
      </div>
    );
  }

  const dateStr = receipt.createdAt
    ? new Date(receipt.createdAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gradient-to-br from-[#1a1a1a] via-[#2d2d2d] to-[#1a1a1a] rounded-2xl shadow-2xl border border-[#333] overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center border-b border-[#333]">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50 mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Payment Successful</h1>
          <p className="text-[#808080] text-sm mt-1">Your payment has been completed successfully.</p>
        </div>

        {/* Receipt */}
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-lime-400" />
            Receipt
          </h2>

          <div className="bg-black/30 rounded-xl border border-[#404040] divide-y divide-[#404040] overflow-hidden">
            <Row label="Order ID" value={receipt.orderId || receipt.paymentId} />
            <Row label="Transaction ID" value={receipt.transactionId || "—"} />
            <Row label="Payment ID" value={receipt.paymentId} />
            <Row label="Amount" value={`₹${receipt.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`} />
            <Row label="Status" value={receipt.status} />
            {receipt.gatewayStatus ? (
              <Row
                label="Gateway Status"
                value={`${receipt.gatewayStatus}${typeof receipt.gatewayStatusId === "number" ? ` (${receipt.gatewayStatusId})` : ""}`}
              />
            ) : null}
            {typeof receipt.amountRefunded === "number" && receipt.amountRefunded > 0 ? (
              <Row label="Refunded" value={`₹${receipt.amountRefunded.toLocaleString("en-IN")}`} />
            ) : null}
            <Row label="Gateway" value={receipt.gateway} />
            <Row label="Date & Time" value={dateStr} />
          </div>

          {receipt.student && (
            <div className="bg-black/30 rounded-xl border border-[#404040] p-4 space-y-2">
              <p className="text-xs text-[#808080] uppercase tracking-wider">Paid for</p>
              {receipt.student.name && (
                <p className="text-white font-medium">{receipt.student.name}</p>
              )}
              {receipt.student.admissionNumber && (
                <p className="text-sm text-[#808080]">Admission No: {receipt.student.admissionNumber}</p>
              )}
              {receipt.student.class && (
                <p className="text-sm text-[#808080]">Class: {receipt.student.class}</p>
              )}
              {receipt.student.school && (
                <p className="text-sm text-[#808080]">{receipt.student.school}</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex flex-col gap-3">
          <Link
            href="/parent?tab=fees"
            className="w-full py-3 px-4 rounded-xl font-semibold text-center text-black bg-lime-500 hover:bg-lime-400 transition flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Fees
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-lime-500/30 border-t-lime-500 mx-auto mb-4" />
            <p className="text-white/80">Loading…</p>
          </div>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-4 py-3">
      <span className="text-sm text-[#808080]">{label}</span>
      <span className="text-sm font-medium text-white text-right break-all max-w-[60%]">{value}</span>
    </div>
  );
}
