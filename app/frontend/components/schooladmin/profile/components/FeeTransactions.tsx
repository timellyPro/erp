import { Receipt, Download, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
  transactionId: string | null;
  feeTypeName?: string;
  feeTypeAmount?: number;
};

type Props = {
  fee?: {
    totalFee: number;
    amountPaid: number;
    remainingFee: number;
  } | null;
  payments?: PaymentRow[];
  studentName?: string;
  studentId?: string;
  admissionNumber?: string;
  applicationFee?: number | null;
  admissionFee?: number | null;
  studentCreatedAt?: string;
  /** Refetch student detail after payment edit/delete */
  onPaymentsChanged?: () => void;
};

function isSyntheticPaymentId(id: string) {
  return id === "admission-fee" || id === "application-fee";
}

function isSuccessStatus(status: string) {
  const u = String(status || "").toUpperCase();
  return u === "SUCCESS" || u === "COMPLETED";
}

export const FeeTransactions = ({
  fee,
  payments,
  studentName = "Student",
  studentId = "",
  admissionNumber = "",
  applicationFee,
  admissionFee,
  studentCreatedAt,
  onPaymentsChanged,
}: Props) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editGateway, setEditGateway] = useState("");
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resolveDisplayAmount = (payment: { amount: number; feeTypeAmount?: number }) => {
    const typeAmount = payment.feeTypeAmount;
    if (typeof typeAmount !== "number" || !Number.isFinite(typeAmount) || typeAmount <= 0) {
      return payment.amount;
    }
    if (payment.amount >= 1 && typeAmount < 1) {
      return payment.amount;
    }
    return typeAmount;
  };

  const hasFee = fee && (fee.totalFee > 0 || fee.amountPaid > 0 || fee.remainingFee > 0);

  const basePayments = payments && payments.length > 0 ? [...payments] : [];

  if (admissionFee && admissionFee > 0) {
    basePayments.push({
      id: "admission-fee",
      amount: admissionFee,
      status: "Paid",
      method: "One-time",
      createdAt: studentCreatedAt || new Date().toISOString(),
      transactionId: "N/A",
      feeTypeName: "Admission Fee",
      feeTypeAmount: admissionFee,
    });
  }

  if (applicationFee && applicationFee > 0) {
    basePayments.push({
      id: "application-fee",
      amount: applicationFee,
      status: "Paid",
      method: "One-time",
      createdAt: studentCreatedAt || new Date().toISOString(),
      transactionId: "N/A",
      feeTypeName: "Application Fee",
      feeTypeAmount: applicationFee,
    });
  }

  const activePayments = [...basePayments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const openEdit = (p: PaymentRow) => {
    setEditing(p);
    setEditAmount(String(p.amount));
    setEditRef(p.transactionId ?? "");
    setEditGateway(p.method || "OFFLINE");
    setEditDate(new Date(p.createdAt).toISOString().slice(0, 10));
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }
    setSaving(true);
    try {
      if (isSyntheticPaymentId(editing.id)) {
        const n = parseFloat(editAmount);
        if (!Number.isFinite(n) || n < 0) {
          alert("Enter a valid amount (0 to clear).");
          setSaving(false);
          return;
        }
        const body: Record<string, unknown> =
          editing.id === "admission-fee"
            ? { admissionFee: n === 0 ? null : n }
            : { applicationFee: n === 0 ? null : n };

        const res = await fetch(`/api/student/${encodeURIComponent(studentId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(typeof data.message === "string" ? data.message : "Update failed");
          return;
        }
        setEditing(null);
        onPaymentsChanged?.();
        return;
      }

      const body: Record<string, unknown> = {
        transactionId: editRef.trim() || null,
        gateway: editGateway.trim() || "OFFLINE",
        createdAt: new Date(editDate + "T12:00:00").toISOString(),
      };
      if (isSuccessStatus(editing.status)) {
        const n = parseFloat(editAmount);
        if (!Number.isFinite(n) || n <= 0) {
          alert("Enter a valid positive amount.");
          setSaving(false);
          return;
        }
        body.amount = n;
      }

      const res = await fetch(`/api/fees/payment/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Update failed");
        return;
      }
      setEditing(null);
      onPaymentsChanged?.();
    } catch {
      alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (p: PaymentRow) => {
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }

    if (isSyntheticPaymentId(p.id)) {
      if (
        !confirm(
          `Remove ${p.feeTypeName || "this fee"} from the student profile? This only clears the recorded amount (not a gateway payment).`
        )
      ) {
        return;
      }
      setDeletingId(p.id);
      try {
        const body =
          p.id === "admission-fee" ? { admissionFee: null } : { applicationFee: null };
        const res = await fetch(`/api/student/${encodeURIComponent(studentId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(typeof data.message === "string" ? data.message : "Delete failed");
          return;
        }
        onPaymentsChanged?.();
      } catch {
        alert("Delete failed");
      } finally {
        setDeletingId(null);
      }
      return;
    }

    if (
      !confirm(
        "Delete this transaction? Student fee totals will be adjusted if this payment was successful."
      )
    ) {
      return;
    }
    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/fees/payment/${encodeURIComponent(p.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Delete failed");
        return;
      }
      onPaymentsChanged?.();
    } catch {
      alert("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const totalPaid = hasFee ? fee!.amountPaid : 0;
  const total = hasFee ? fee!.amountPaid + fee!.remainingFee : 0;
  const hasAny = hasFee || activePayments.length > 0;

  const handleDownloadReceipt = async (payment: (typeof activePayments)[0], copyType: "admin" | "parent") => {
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }
    try {
      setDownloadingId(`${payment.id}-${copyType}`);
      const response = await fetch(
        `/api/student/receipt?paymentId=${encodeURIComponent(payment.id)}&studentId=${encodeURIComponent(studentId)}&studentName=${encodeURIComponent(studentName)}&admissionNumber=${encodeURIComponent(admissionNumber)}&copyType=${encodeURIComponent(copyType)}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        const ct = response.headers.get("content-type") || "";
        let msg = "Failed to download receipt";
        if (ct.includes("application/json")) {
          try {
            const j = (await response.json()) as { error?: string; message?: string };
            msg = j.error || j.message || msg;
          } catch {
            /* ignore */
          }
        }
        alert(msg);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const copyLabel = copyType === "admin" ? "Admin" : "Parent";
      a.download = `Receipt_${admissionNumber}_${copyLabel}_${new Date(payment.createdAt).toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading receipt:", error);
      alert("Failed to download receipt. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      id="student-profile-fees-section"
      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-3 sm:p-6 mt-4 sm:mt-6 min-w-0 scroll-mt-28 sm:scroll-mt-24"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 sm:mb-8">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-lime-400 flex-shrink-0" /> Fee Details & Transactions
        </h3>
        {hasFee && (
          <div className="text-left sm:text-right">
            <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">FEES PAID / TOTAL</p>
            <p className="text-xl sm:text-2xl font-bold text-white">
              ₹{totalPaid.toLocaleString("en-IN")}{" "}
              <span className="text-gray-500">/ ₹{total.toLocaleString("en-IN")}</span>
            </p>
          </div>
        )}
      </div>

      {!hasAny ? (
        <div className="py-8 text-center text-gray-500 text-sm">No fee records</div>
      ) : (
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x -mx-1 px-1 sm:mx-0 sm:px-0 pb-1 rounded-lg">
          <table className="w-full text-left min-w-[860px]">
            <thead>
              <tr className="text-[11px] text-gray-400 font-bold tracking-wider uppercase border-b border-white/5">
                <th className="pb-4 font-medium">DATE</th>
                <th className="pb-4 font-medium">DESCRIPTION</th>
                <th className="pb-4 font-medium">FEE TYPE</th>
                <th className="pb-4 font-medium">METHOD</th>
                <th className="pb-4 font-medium">STATUS</th>
                <th className="pb-4 font-medium text-right">AMOUNT</th>
                <th className="pb-4 font-medium text-center">RECEIPT</th>
                <th className="pb-4 w-36 min-w-[9.5rem] font-medium text-right whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {activePayments.map((p) => {
                const synthetic = isSyntheticPaymentId(p.id);
                const canEditRow = Boolean(studentId.trim());
                return (
                  <tr
                    key={p.id}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-4 sm:py-5 text-gray-400 whitespace-nowrap">
                      {new Date(p.createdAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="py-4 sm:py-5 font-bold text-gray-100">Fee payment</td>
                    <td className="py-4 sm:py-5 text-gray-400">{p.feeTypeName || "-"}</td>
                    <td className="py-4 sm:py-5 text-gray-400">{p.method || "-"}</td>
                    <td className="py-4 sm:py-5">
                      <span className="bg-lime-400/20 text-lime-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase">
                        {p.status || "Paid"}
                      </span>
                    </td>
                    <td className="py-4 sm:py-5 text-right font-bold text-white whitespace-nowrap">
                      ₹{resolveDisplayAmount(p).toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-center">
                      <div className="flex gap-2 justify-center items-center flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(p, "admin")}
                          disabled={downloadingId === `${p.id}-admin`}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-600 disabled:cursor-not-allowed text-blue-400 disabled:text-gray-500 rounded text-xs font-semibold transition-colors"
                          title="Download Admin Copy"
                        >
                          <Download className="w-3 h-3" />
                          <span className="hidden sm:inline">Admin</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(p, "parent")}
                          disabled={downloadingId === `${p.id}-parent`}
                          className="flex items-center gap-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 disabled:bg-gray-600 disabled:cursor-not-allowed text-green-400 disabled:text-gray-500 rounded text-xs font-semibold transition-colors"
                          title="Download Parent Copy"
                        >
                          <Download className="w-3 h-3" />
                          <span className="hidden sm:inline">Parent</span>
                        </button>
                      </div>
                    </td>
                    <td className="py-4 sm:py-5 w-36 min-w-[9.5rem] text-right align-middle">
                      <div className="flex justify-end gap-2 flex-nowrap shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          disabled={!canEditRow}
                          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-lime-500/40 bg-lime-500/15 px-2.5 py-2 text-xs font-semibold text-lime-300 hover:bg-lime-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            synthetic
                              ? "Edit amount stored on student (admission / application fee)"
                              : "Edit transaction"
                          }
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4 shrink-0 text-lime-300" strokeWidth={2.25} aria-hidden />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDelete(p)}
                          disabled={!canEditRow || deletingId === p.id}
                          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-rose-400/50 bg-rose-500/20 px-2.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            synthetic
                              ? "Remove this fee from the student profile"
                              : "Delete transaction"
                          }
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4 shrink-0 text-rose-300" strokeWidth={2.25} aria-hidden />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-payment-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h4 id="edit-payment-title" className="text-lg font-semibold text-white">
                {editing && isSyntheticPaymentId(editing.id)
                  ? `Edit ${editing.feeTypeName || "fee"}`
                  : "Edit transaction"}
              </h4>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              {isSyntheticPaymentId(editing.id) ? (
                <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                  This line is the amount stored on the student profile (not a separate payment
                  record). Saving updates the student; use 0 to clear.
                </p>
              ) : null}
              {isSyntheticPaymentId(editing.id) || isSuccessStatus(editing.status) ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/50">Amount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                  />
                </div>
              ) : (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
                  Amount can only be edited for successful (SUCCESS) payments. You can still update
                  reference, method, and date.
                </p>
              )}
              {!isSyntheticPaymentId(editing.id) ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/50">Reference / UTR</label>
                    <input
                      type="text"
                      value={editRef}
                      onChange={(e) => setEditRef(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                      placeholder="Transaction reference"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/50">Method (gateway)</label>
                    <input
                      type="text"
                      value={editGateway}
                      onChange={(e) => setEditGateway(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                      placeholder="e.g. OFFLINE, HYPERPG, CASH"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/50">Date recorded</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                    />
                  </div>
                </>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
