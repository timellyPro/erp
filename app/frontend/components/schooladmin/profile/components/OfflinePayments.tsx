"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Plus, Check } from "lucide-react";

type Props = {
    studentId: string;
    studentName: string;
    remainingFee: number;
    onPaymentAdded?: () => void;
};

type OfflinePaymentMethod = "CASH" | "CHEQUE" | "BANK_TRANSFER" | "DD";

type SelectedHead =
  | { headType: "BASE_COMPONENT"; componentIndex: number; componentName: string }
  | { headType: "EXTRA_FEE"; extraFeeId: string };

export const OfflinePayments = ({ studentId, studentName, remainingFee, onPaymentAdded }: Props) => {
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [messageTone, setMessageTone] = useState<"success" | "error">("success");

    const [formData, setFormData] = useState({
        method: "CASH" as OfflinePaymentMethod,
        amount: "",
        description: "",
        referenceNumber: "",
        bankName: "",
    });

    const [headOptions, setHeadOptions] = useState<
      Array<{ key: string; label: string; dueBefore: number; head: SelectedHead }>
    >([]);
    const [selectedHeads, setSelectedHeads] = useState<SelectedHead[]>([]);
    const [breakdownLoading, setBreakdownLoading] = useState(false);
    const [breakdownError, setBreakdownError] = useState<string | null>(null);
    const [currentRemainingFee, setCurrentRemainingFee] = useState<number>(remainingFee);

    useEffect(() => {
      if (!showModal) return;
      let cancelled = false;
      setSelectedHeads([]);

      const loadBreakdown = async () => {
        setBreakdownLoading(true);
        setBreakdownError(null);
        try {
          const res = await fetch(`/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}`, {
            credentials: "include",
            cache: "no-store",
          });
          const data = await res.json();
          if (!res.ok) {
            if (!cancelled) setBreakdownError(data?.message || "Failed to load fee heads");
            return;
          }
          if (!cancelled && Array.isArray(data.dueHeads)) {
            setCurrentRemainingFee(Number(data.remainingFee) || 0);
            const opts: Array<{ key: string; label: string; dueBefore: number; head: SelectedHead }> =
              data.dueHeads.map((h: any) => {
                const key: string = h.key;
                const label: string = h.label;
                const dueBefore: number = Number(h.dueBefore) || 0;
                if (h.headType === "BASE_COMPONENT" && key.startsWith("BASE:")) {
                  const idx = Number(key.slice("BASE:".length));
                  const head: SelectedHead = {
                    headType: "BASE_COMPONENT",
                    componentIndex: idx,
                    componentName: label,
                  };
                  return { key, label, dueBefore, head };
                }
                if (h.headType === "EXTRA_FEE" && key.startsWith("EXTRA:")) {
                  const extraFeeId = key.slice("EXTRA:".length);
                  const head: SelectedHead = {
                    headType: "EXTRA_FEE",
                    extraFeeId,
                  };
                  return { key, label, dueBefore, head };
                }
                return null;
              });
            setHeadOptions(opts.filter((x): x is { key: string; label: string; dueBefore: number; head: SelectedHead } => Boolean(x)));
          }
        } catch (e: any) {
          if (!cancelled) setBreakdownError(e?.message || "Failed to load fee heads");
        } finally {
          if (!cancelled) setBreakdownLoading(false);
        }
      };

      loadBreakdown();
      return () => {
        cancelled = true;
      };
    }, [showModal, studentId]);

    const toggleHead = (head: SelectedHead) => {
      const getKey = (h: SelectedHead) =>
        h.headType === "BASE_COMPONENT" ? `BASE:${h.componentIndex}` : `EXTRA:${h.extraFeeId}`;
      const key = getKey(head);
      setSelectedHeads((prev) => {
        const exists = prev.some((h) => getKey(h) === key);
        if (exists) return prev.filter((h) => getKey(h) !== key);
        return [...prev, head];
      });
    };

    const numericAmount = useMemo(() => parseFloat(formData.amount) || 0, [formData.amount]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const amount = parseFloat(formData.amount);
            if (!amount || amount <= 0) {
                throw new Error("Please enter a valid amount");
            }

            if (amount > currentRemainingFee) {
                throw new Error(`Amount exceeds remaining fee of ₹${currentRemainingFee.toLocaleString("en-IN")}`);
            }

            if (formData.method === "CHEQUE" && !formData.referenceNumber) {
                throw new Error("Cheque number is required");
            }

            if (formData.method === "BANK_TRANSFER" && !formData.bankName) {
                throw new Error("Bank name is required");
            }

            if (selectedHeads.length === 0) {
                throw new Error("Please select at least one fee head");
            }

            const paymentMode =
              formData.method === "CHEQUE"
                ? "Cheque"
                : formData.method === "BANK_TRANSFER"
                ? "Bank"
                : formData.method === "DD"
                ? "Cash"
                : "Cash";

            const response = await fetch("/api/fees/offline-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    studentId,
                    amount,
                    paymentMode,
                    refNo: formData.referenceNumber || undefined,
                    selectedHeads,
                }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data?.message || "Failed to record payment");

            setMessageTone("success");
            setMessage("Offline payment recorded successfully!");
            setFormData({ method: "CASH", amount: "", description: "", referenceNumber: "", bankName: "" });
            setSelectedHeads([]);
            setTimeout(() => {
                setShowModal(false);
                onPaymentAdded?.();
            }, 1500);
        } catch (error) {
            setMessageTone("error");
            setMessage(error instanceof Error ? error.message : "Failed to record payment");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-400 flex-shrink-0" /> Offline Payments
                </h3>
                <button
                    onClick={() => setShowModal(!showModal)}
                    className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-xl text-blue-400 hover:bg-blue-500/30 text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                    <Plus size={16} className={`transform transition-transform ${showModal ? 'rotate-45' : ''}`} />
                    {showModal ? 'Cancel' : 'Record Payment'}
                </button>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm">
                <p className="text-blue-300">
                    <span className="font-semibold">Remaining Fee:</span>{" "}
                    <span className="text-lg font-bold">₹{currentRemainingFee.toLocaleString("en-IN")}</span>
                </p>
                <p className="text-blue-200/70 text-xs mt-2">
                    Record cash, cheque, bank transfer, or demand draft payments manually.
                </p>
            </div>

            {showModal && (
                <div className="mt-6 bg-black/20 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4 animation-fadeIn">
                    <h4 className="text-white font-semibold text-lg">Record Offline Payment</h4>
                    <p className="text-sm text-gray-400">Student: {studentName}</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-2">Payment Method</label>
                            <select
                                value={formData.method}
                                onChange={(e) => setFormData({ ...formData, method: e.target.value as OfflinePaymentMethod })}
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-gray-200 text-sm outline-none focus:ring-1 focus:ring-blue-400/50"
                            >
                                <option value="CASH">Cash</option>
                                <option value="CHEQUE">Cheque</option>
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                <option value="DD">Demand Draft (DD)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-2">Amount (₹)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                placeholder="0"
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-gray-200 text-sm outline-none focus:ring-1 focus:ring-blue-400/50"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-400 mb-2">Select Fee Heads</label>
                            <div className="rounded-xl border border-white/10 bg-black/20 max-h-48 overflow-y-auto divide-y divide-white/5">
                                {breakdownLoading ? (
                                    <p className="px-4 py-3 text-xs text-gray-400">Loading heads...</p>
                                ) : breakdownError ? (
                                    <p className="px-4 py-3 text-xs text-red-400">{breakdownError}</p>
                                ) : headOptions.length === 0 ? (
                                    <p className="px-4 py-3 text-xs text-gray-500">No fee heads configured.</p>
                                ) : (
                                    headOptions.map((opt) => {
                                        const checked = selectedHeads.some((h) => {
                                            if (h.headType === "BASE_COMPONENT" && opt.head.headType === "BASE_COMPONENT") {
                                                return h.componentIndex === opt.head.componentIndex;
                                            }
                                            if (h.headType === "EXTRA_FEE" && opt.head.headType === "EXTRA_FEE") {
                                                return h.extraFeeId === opt.head.extraFeeId;
                                            }
                                            return false;
                                        });
                                        return (
                                            <label
                                                key={opt.key}
                                                className="flex items-center justify-between gap-3 px-4 py-2 text-xs sm:text-sm text-gray-200 cursor-pointer hover:bg-white/5 transition-colors"
                                            >
                                                <span className="flex-1 min-w-0">
                                                    <span className="block truncate">{opt.label}</span>
                                                    <span className="block text-[10px] text-gray-400">
                                                        Due before: ₹{opt.dueBefore.toFixed(0).toLocaleString()}
                                                    </span>
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-white/40 accent-blue-500"
                                                    checked={checked}
                                                    onChange={() => toggleHead(opt.head)}
                                                />
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {formData.method === "CHEQUE" && (
                            <div>
                                <label className="block text-xs text-gray-400 mb-2">Cheque Number</label>
                                <input
                                    type="text"
                                    value={formData.referenceNumber}
                                    onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                                    placeholder="e.g., 123456"
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-gray-200 text-sm outline-none focus:ring-1 focus:ring-blue-400/50"
                                    required
                                />
                            </div>
                        )}

                        {formData.method === "BANK_TRANSFER" && (
                            <div>
                                <label className="block text-xs text-gray-400 mb-2">Bank Name</label>
                                <input
                                    type="text"
                                    value={formData.bankName}
                                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                                    placeholder="e.g., HDFC Bank"
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-gray-200 text-sm outline-none focus:ring-1 focus:ring-blue-400/50"
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs text-gray-400 mb-2">Description (optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="e.g., Lab fee payment"
                                rows={2}
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-gray-200 text-sm outline-none focus:ring-1 focus:ring-blue-400/50"
                            />
                        </div>

                        {message && (
                            <div
                                className={`rounded-xl border p-3 text-sm ${messageTone === "success"
                                        ? "bg-green-400/10 border-green-400/20 text-green-300"
                                        : "bg-red-500/10 border-red-500/20 text-red-300"
                                    }`}
                            >
                                {messageTone === "success" && <Check size={16} className="inline mr-2" />}
                                {message}
                            </div>
                        )}

                        <div className="flex gap-3 justify-end pt-4">
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-xl text-blue-400 text-sm font-semibold hover:bg-blue-500/30 disabled:opacity-60"
                            >
                                {loading ? "Recording..." : "Record Payment"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

