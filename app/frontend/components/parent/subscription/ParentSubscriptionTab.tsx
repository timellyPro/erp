"use client";

import { useEffect, useState } from "react";
import { Receipt, ShieldCheck, Clock, CreditCard } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import ParentTimellyLoader from "../ParentTimellyLoader";
import PayButton from "../../common/PayButton";

type StatusResponse = {
  status: "ACTIVE" | "EXPIRED";
  isTrial: boolean;
  billingMode: string;
  amount: number;
  remainingDays: number | null;
  expiresAt: string | null;
  trialDays?: number;
  deactivated?: boolean;
  message?: string;
};

type HistoryItem = {
  id: string;
  amount: number;
  createdAt: string;
  transactionId: string | null;
};

export default function ParentSubscriptionTab() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [statusRes, historyRes] = await Promise.all([
          fetch("/api/parent/subscription/status", { credentials: "include" }),
          fetch("/api/parent/subscription/history", { credentials: "include" }),
        ]);
        const statusData = await statusRes.json();
        const historyData = await historyRes.json();
        if (!cancelled) {
          if (statusRes.ok) setStatus(statusData as StatusResponse);
          else setError(statusData.message || "Failed to load subscription status");
          if (historyRes.ok) setHistory(historyData.payments ?? []);
        }
      } catch {
        if (!cancelled) setError("Something went wrong while loading subscription data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <ParentTimellyLoader preset="subscription" className="w-full max-w-2xl" />
      </div>
    );
  }

  if (status?.deactivated) {
    return (
      <div className="max-w-3xl mx-auto mt-6">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <ShieldCheck className="w-8 h-8 text-red-300 mx-auto mb-2" />
          <h2 className="text-lg font-semibold text-white mb-1">School access deactivated</h2>
          <p className="text-sm text-red-100/80">
            {status.message ??
              "Your school's Timelly access is deactivated. Please contact your school or Timelly support for help."}
          </p>
        </div>
      </div>
    );
  }

  const isActive = status?.status === "ACTIVE";
  const showPayButton =
    status &&
    status.billingMode === "PARENT_SUBSCRIPTION" &&
    status.status !== "ACTIVE" &&
    !status.isTrial;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Subscription"
        subtitle="Manage your Timelly parent subscription"
        compact
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {status && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 flex flex-col md:flex-row gap-4 md:gap-6 items-start md:items-center">
          <div className="flex-1 space-y-1">
            <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-lime-300" />
              Subscription status
            </h2>
            <p className="text-sm text-white/60">
              {status.billingMode === "SCHOOL_PAID"
                ? "Your school has a central Timelly subscription. You don't need to pay separately."
                : isActive
                ? status.isTrial
                  ? "Your free trial is active."
                  : "Your parent subscription is active."
                : "Your parent subscription is not active."}
            </p>
            {status.billingMode === "PARENT_SUBSCRIPTION" && (
              <>
                <p className="text-sm text-white mt-1">
                  <span className="text-white/60">Plan amount:&nbsp;</span>
                  <span className="font-semibold">
                    ₹{(status.amount || 0).toLocaleString("en-IN")}
                    <span className="text-xs text-white/60">&nbsp;/ year</span>
                  </span>
                </p>
                {typeof status.trialDays === "number" && status.trialDays > 0 && (
                  <p className="text-xs text-white/60 mt-1">
                    Free trial: <span className="font-semibold text-white">{status.trialDays} day{status.trialDays > 1 ? "s" : ""}</span>
                  </p>
                )}
                {status.remainingDays != null && status.remainingDays > 0 && (
                  <p className="text-xs text-white/60 flex items-center gap-1 mt-1">
                    <Clock className="w-3.5 h-3.5 text-lime-300" />
                    {status.isTrial ? "Trial ends in" : "Expires in"}{" "}
                    <span className="font-semibold text-white">
                      {status.remainingDays} day{status.remainingDays > 1 ? "s" : ""}
                    </span>
                  </p>
                )}
              </>
            )}
          </div>

          {showPayButton && (
            <div className="w-full md:w-64">
              <PayButton
                amount={status.amount > 0 ? status.amount : 1}
                endpoint="/api/parent/subscription/create-order"
                returnPath="/frontend/pages/parent?tab=subscription"
                onSuccess={() => {
                  window.location.href = "/frontend/pages/parent?tab=subscription";
                }}
              />
              <p className="mt-2 text-[11px] text-white/50 flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                Secure payment via Timelly partner payment gateway.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-lime-300" />
            Subscription invoices
          </h2>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-white/50 py-4">
            No subscription payments found. Once you complete a payment, your invoices will appear
            here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs text-white/60 border-b border-white/10">
                  <th className="py-2 pr-4 text-left">Date</th>
                  <th className="py-2 pr-4 text-left">Amount</th>
                  <th className="py-2 pr-4 text-left">Order ID</th>
                  <th className="py-2 pr-4 text-left">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-4 text-white/80">
                      {new Date(p.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="py-2 pr-4 text-white">
                      ₹{p.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-2 pr-4 text-white/70 text-xs">
                      {p.transactionId ?? "-"}
                    </td>
                    <td className="py-2 pr-4">
                      <a
                        href={`/api/payment/receipt?paymentId=${encodeURIComponent(p.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-lime-300 hover:text-lime-200"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

