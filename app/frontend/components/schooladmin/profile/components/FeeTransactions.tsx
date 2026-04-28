import { Receipt, Download, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import FeePaymentReceiptTemplate, {
  type FeePaymentReceiptData,
} from "../../../pdf/FeePaymentReceiptTemplate";
import { generatePDF } from "@/lib/pdfUtils";

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
  classDisplayName?: string;
  residencyType?: string;
  parentName?: string;
  parentPhone?: string;
  /** Refetch student detail after payment edit/delete */
  onPaymentsChanged?: () => void;
};

function isSyntheticPaymentId(id: string) {
  return id === "admission-fee" || id === "application-fee" || id === "legacy-paid-adjustment";
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
  classDisplayName = "-",
  residencyType = "Day Scholar",
  parentName = "-",
  parentPhone = "-",
  onPaymentsChanged,
}: Props) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [receiptData, setReceiptData] = useState<FeePaymentReceiptData | null>(null);
  const [schoolBrand, setSchoolBrand] = useState<{
    name: string;
    address: string;
    logo: string | null;
  }>({ name: "", address: "", logo: null });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editGateway, setEditGateway] = useState("");
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
        const d = await res.json();
        if (!res.ok || cancelled) return;

        const name = typeof d?.school?.name === "string" ? d.school.name : "";
        const address = [d?.school?.address, d?.school?.location]
          .filter((v: unknown) => typeof v === "string" && String(v).trim())
          .join(", ");

        let rawLogo: string | null =
          typeof d?.school?.logoUrl === "string" && d.school.logoUrl.trim()
            ? d.school.logoUrl.trim()
            : null;
        if (!rawLogo && Array.isArray(d?.school?.admins) && d.school.admins[0]?.photoUrl) {
          rawLogo = String(d.school.admins[0].photoUrl).trim();
        }
        if (!rawLogo) {
          try {
            const ur = await fetch("/api/user/me", { credentials: "include", cache: "no-store" });
            const ud = await ur.json();
            if (typeof ud?.user?.photoUrl === "string" && ud.user.photoUrl.trim()) {
              rawLogo = ud.user.photoUrl.trim();
            }
          } catch {
            /* noop */
          }
        }

        let logoData: string | null = null;
        if (rawLogo) {
          let parsed = rawLogo;
          if (parsed.includes("/storage/v1/object/")) {
            parsed = `/api/media?url=${encodeURIComponent(parsed)}`;
          }
          if (parsed.startsWith("/")) {
            parsed = `${window.location.origin}${parsed}`;
          }
          try {
            const imgRes = await fetch(parsed);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              logoData = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string) || null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          } catch {
            logoData = null;
          }
        }

        if (!logoData && name) {
          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=128&background=4ade80&color=fff`;
          try {
            const fr = await fetch(fallback);
            if (fr.ok) {
              const blob = await fr.blob();
              logoData = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string) || null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          } catch {
            /* noop */
          }
        }

        if (!cancelled) {
          setSchoolBrand({ name: name || "School", address: address || "-", logo: logoData });
        }
      } catch {
        if (!cancelled) {
          setSchoolBrand({ name: "School", address: "-", logo: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const successfulPaymentTotal = basePayments.reduce((sum, p) => {
    if (!isSuccessStatus(p.status)) return sum;
    return sum + resolveDisplayAmount(p);
  }, 0);
  const feePaidTotal = fee?.amountPaid ?? 0;
  const legacyGapAmount = Math.max(Math.round((feePaidTotal - successfulPaymentTotal) * 100) / 100, 0);

  if (legacyGapAmount > 0.01) {
    basePayments.push({
      id: "legacy-paid-adjustment",
      amount: legacyGapAmount,
      status: "SUCCESS",
      method: "SYSTEM",
      createdAt: studentCreatedAt || new Date().toISOString(),
      transactionId: "AUTO-ADJUSTMENT",
      feeTypeName: "Previous Payment Adjustment",
      feeTypeAmount: legacyGapAmount,
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

  const buildReceiptDescription = (p: (typeof activePayments)[0]) => {
    const label = p.feeTypeName?.trim() || "Fee payment";
    const methodPart = p.method?.trim() ? `Method: ${p.method.trim()}` : null;
    const ref = p.transactionId?.trim();
    const refPart =
      ref && ref.toUpperCase() !== "N/A" ? `Reference / UTR: ${ref}` : null;
    return [label, methodPart, refPart].filter(Boolean).join(" • ");
  };

  const handleDownloadReceipt = (payment: (typeof activePayments)[0]) => {
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }
    const amount = resolveDisplayAmount(payment);
    const receiptTitle =
      payment.id === "admission-fee" || payment.id === "application-fee"
        ? "Admission Receipt"
        : "Fee Receipt";
    const data: FeePaymentReceiptData = {
      schoolName: schoolBrand.name || "School",
      schoolLogo: schoolBrand.logo,
      schoolAddress: schoolBrand.address || "-",
      studentName: studentName || "Student",
      className: classDisplayName || "-",
      residencyType: residencyType || "Day Scholar",
      parentName: parentName || "-",
      parentPhone: parentPhone || "-",
      createdAt: payment.createdAt,
      lines: [{ description: buildReceiptDescription(payment), amount }],
      total: amount,
      receiptTitle,
    };

    setDownloadingId(payment.id);
    setReceiptData(data);

    setTimeout(async () => {
      try {
        const day = new Date(payment.createdAt).toISOString().split("T")[0];
        const safeAdm = (admissionNumber || "student").replace(/[^\w\-/]+/g, "_");
        await generatePDF(receiptRef, `Fee_Receipt_${safeAdm}_${day}.pdf`);
      } catch (error) {
        console.error("Error generating receipt PDF:", error);
        alert("Failed to generate receipt. Please try again.");
      } finally {
        setDownloadingId(null);
        setReceiptData(null);
      }
    }, 500);
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
                    <td className="py-4 sm:py-5 font-bold text-gray-100">
                      {p.id === "legacy-paid-adjustment" ? "Opening balance adjustment" : "Fee payment"}
                    </td>
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
                      <button
                        type="button"
                        onClick={() => handleDownloadReceipt(p)}
                        disabled={downloadingId === p.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-lime-500/20 hover:bg-lime-500/30 disabled:bg-gray-600 disabled:cursor-not-allowed text-lime-300 disabled:text-gray-500 rounded-lg text-xs font-semibold transition-colors"
                        title="Download PDF — same layout as admission receipt (two copies on one page)"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>Download</span>
                      </button>
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

      <FeePaymentReceiptTemplate ref={receiptRef} data={receiptData} />

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
