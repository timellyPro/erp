"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { openExternalUrl } from "@/lib/capacitor";

interface PayButtonProps {
  amount: number;
  onSuccess?: () => void;
  /** When paying from parent fees, pass "/frontend/pages/parent?tab=fees" so redirect returns here */
  returnPath?: string;
  /** For workshop payments, pass event registration id so enrollment is updated on success */
  eventRegistrationId?: string;
  /** Optional override for API endpoint (default: /api/payment/create-order) */
  endpoint?: string;
  /** Optional fee selection when paying for fees (base components + extra fees) */
  feeSelection?: Array<
    | { headType: "BASE_COMPONENT"; componentIndex: number; componentName?: string }
    | { headType: "EXTRA_FEE"; extraFeeId: string }
  >;
  disabled?: boolean;
}

export default function PayButton({
  amount,
  onSuccess,
  returnPath,
  eventRegistrationId,
  endpoint = "/api/payment/create-order",
  feeSelection,
  disabled,
}: PayButtonProps) {
  const [loading, setLoading] = useState(false);

  const payNow = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const normalizedAmount = Number(amount.toFixed(2));

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: normalizedAmount,
          ...(returnPath && { return_path: returnPath }),
          ...(eventRegistrationId && { event_registration_id: eventRegistrationId }),
          ...(feeSelection && feeSelection.length > 0 ? { fee_selection: feeSelection } : {}),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.details || errorData.error || errorData.message || "Unknown error";
        const status = errorData.statusFromGateway ? ` (Gateway ${errorData.statusFromGateway})` : "";
        alert(`Failed to create order: ${msg}${status}`);
        setLoading(false);
        return;
      }

      const order = await res.json();

      if (order.gateway === "HYPERPG" && order.payment_url) {
        // HyperPG return_url has no query params; store order_id|amount in cookie for verification on return
        const payload = `${order.order_id || order.id}|${order.amount}`;
        document.cookie = `hyperpg_pending=${encodeURIComponent(payload)}; path=/; max-age=600; samesite=lax`;
        await openExternalUrl(order.payment_url);
        setLoading(false);
        return;
      }

      alert("Payment is not configured. Please contact support.");
      setLoading(false);
    } catch (err) {
      console.error(err);
      alert("Payment failed");
      setLoading(false);
    }
  };

  return (
    <motion.button
      type="button"
      disabled={loading || disabled}
      whileHover={loading ? {} : { scale: 1.05, y: -2 }}
      whileTap={loading ? {} : { scale: 0.95 }}
      onClick={payNow}
      className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-teal-600 hover:to-emerald-500 disabled:from-emerald-600 disabled:to-teal-700 disabled:opacity-90 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg border border-emerald-400/30 transition-all duration-300"
    >
      {loading ? (
        <>
          <Loader2 size={20} className="animate-spin" />
          Redirecting to payment…
        </>
      ) : (
        <>
          <CreditCard size={20} />
          Pay ₹
          {Number(amount).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </>
      )}
    </motion.button>
  );
}
