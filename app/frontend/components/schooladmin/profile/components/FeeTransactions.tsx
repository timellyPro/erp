import { Receipt, Printer, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import FeePaymentReceiptTemplate, {
  type FeePaymentReceiptData,
} from "../../../pdf/FeePaymentReceiptTemplate";
import { printFromElement } from "@/lib/pdfUtils";
import { formatResidencyTypeForDisplay } from "@/lib/residencyDisplay";

type PaymentFeeAllocationLine = { name: string; amount: number };

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
  transactionId: string | null;
  feeTypeName?: string;
  feeTypeAmount?: number;
  feeAllocations?: PaymentFeeAllocationLine[];
};

/** One table row per fee head (split payments are not grouped). */
type TransactionDisplayRow = {
  rowKey: string;
  paymentId: string;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
  transactionId: string | null;
  feeTypeName: string;
  sourcePayment: PaymentRow;
};

function paymentFeeTypeLines(payment: PaymentRow): PaymentFeeAllocationLine[] {
  if (payment.feeAllocations && payment.feeAllocations.length > 0) {
    return payment.feeAllocations;
  }
  if (payment.feeTypeName) {
    return [
      {
        name: payment.feeTypeName,
        amount: payment.feeTypeAmount ?? payment.amount,
      },
    ];
  }
  return [];
}

/** One table row per fee head on each payment (never merge multiple heads into one row). */
function paymentsToTransactionRows(payments: PaymentRow[]): TransactionDisplayRow[] {
  const rows: TransactionDisplayRow[] = [];

  for (const payment of payments) {
    const lines = paymentFeeTypeLines(payment);
    const base = {
      paymentId: payment.id,
      status: payment.status,
      method: payment.method,
      createdAt: payment.createdAt,
      transactionId: payment.transactionId,
      sourcePayment: payment,
    };

    if (lines.length === 0) {
      rows.push({
        ...base,
        rowKey: payment.id,
        amount: payment.amount,
        feeTypeName: payment.feeTypeName || "-",
      });
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      rows.push({
        ...base,
        rowKey: lines.length === 1 ? payment.id : `${payment.id}:${i}:${line.name}`,
        amount: line.amount,
        feeTypeName: line.name,
      });
    }
  }

  return rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

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
  motherName?: string;
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

const EDIT_GATEWAY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "OFFLINE_CASH", label: "Cash" },
  { value: "OFFLINE_ONLINE", label: "Online (UPI / QR / net banking)" },
  { value: "OFFLINE_UPI", label: "UPI" },
  { value: "OFFLINE_BANK_TRANSFER", label: "Bank transfer / NEFT / RTGS" },
  { value: "OFFLINE_CHEQUE", label: "Cheque" },
  { value: "OFFLINE_DD", label: "Demand draft (DD)" },
  { value: "OFFLINE_OTHERS", label: "Others" },
  { value: "HYPERPG", label: "Online — payment gateway (HyperPG)" },
];

function formatPaymentMethod(method?: string) {
  const m = String(method || "").trim().toUpperCase();
  if (!m) return "-";
  if (m === "OFFLINE" || m === "CASH" || m === "OFFLINE_CASH") return "Cash";
  if (m === "UPI" || m === "OFFLINE_UPI") return "UPI";
  if (m === "CHEQUE" || m === "OFFLINE_CHEQUE") return "Cheque";
  if (m === "DD" || m === "OFFLINE_DD") return "DD";
  if (m === "ONLINE" || m === "OFFLINE_ONLINE") return "Online";
  if (m === "BANK_TRANSFER" || m === "OFFLINE_BANK_TRANSFER") return "Bank Transfer";
  if (m === "CARD" || m === "OFFLINE_CARD") return "Card";
  if (m === "HYPERPG") return "Online";
  if (m === "OFFLINE_OTHERS" || m === "OTHERS") return "Others";
  if (m.startsWith("OFFLINE_")) {
    return m
      .slice("OFFLINE_".length)
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return method || "-";
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
  motherName = "-",
  onPaymentsChanged,
}: Props) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [receiptData, setReceiptData] = useState<FeePaymentReceiptData | null>(null);
  const [schoolBrand, setSchoolBrand] = useState<{
    name: string;
    address: string;
    logo: string | null;
  }>({ name: "", address: "", logo: null });

  const [printingId, setPrintingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editGateway, setEditGateway] = useState("");
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
        const d = await res.json();
        if (!res.ok || cancelled) return;

        const name = typeof d?.school?.name === "string" ? d.school.name : "";
        const addressParts = [d?.school?.address, d?.school?.location]
          .filter((v: unknown) => typeof v === "string" && String(v).trim())
          .map((v: unknown) => String(v).trim());
        const address = addressParts
          .filter((part, idx) => addressParts.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === idx)
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

  const transactionRows = paymentsToTransactionRows(basePayments);

  const openEdit = (p: PaymentRow) => {
    setEditing(p);
    setEditAmount(String(p.amount));
    setEditRef(p.transactionId ?? "");
    setEditGateway((p.method || "OFFLINE_CASH").trim());
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
        gateway: editGateway.trim() || "OFFLINE_CASH",
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
  const hasAny = hasFee || transactionRows.length > 0;

  const simplifyFeeHeadName = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "Fee";
    const lower = raw.toLowerCase();
    if (lower.includes("tuition")) return "Tuition Fee";
    if (lower.includes("mess")) return "Mess Fee";
    if (lower.includes("transport")) return "Transportation Fee";
    const cleaned = raw
      .replace(/\b\d+(st|nd|rd|th)\s*installment\b/gi, "")
      .replace(/\binstallment\b/gi, "")
      .replace(/\s*-\s*[\w\s]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned || raw;
  };

  const buildReceiptDataFromTransactionRows = (
    selectedRows: TransactionDisplayRow[],
    createdAt: string
  ) => {
    const groupedLines = selectedRows.map((row) => {
      const currentRef =
        row.transactionId?.trim() && row.transactionId !== "N/A" ? row.transactionId.trim() : "-";
      return {
        description: simplifyFeeHeadName(row.feeTypeName),
        amount: row.amount,
        paymentMethod: formatPaymentMethod(row.method),
        utrNo: currentRef,
      };
    });
    const finalTotal = groupedLines.reduce((s, l) => s + l.amount, 0);
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const receiptTitle =
      selectedRows.length === 1 &&
      (selectedRows[0].paymentId === "admission-fee" ||
        selectedRows[0].paymentId === "application-fee")
        ? "Admission Receipt"
        : "Fee Receipt";
    return {
      schoolName: schoolBrand.name || "School",
      schoolLogo: schoolBrand.logo,
      schoolAddress: schoolBrand.address || "-",
      studentName: studentName || "Student",
      admissionNumber,
      className: classDisplayName || "-",
      academicYear: `${startYear}-${String(startYear + 1).slice(-2)}`,
      fatherName: parentName || "-",
      motherName: motherName || "-",
      residencyType: formatResidencyTypeForDisplay(residencyType || "Day Scholar"),
      parentName: parentName || "-",
      parentPhone: parentPhone || "-",
      createdAt,
      lines: groupedLines,
      total: finalTotal,
      receiptTitle,
    } satisfies FeePaymentReceiptData;
  };

  const handlePrintReceipt = (row: TransactionDisplayRow) => {
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }
    const data = buildReceiptDataFromTransactionRows([row], row.createdAt);

    setPrintingId(row.rowKey);
    setReceiptData(data);

    setTimeout(async () => {
      try {
        await printFromElement(receiptRef);
      } catch (error) {
        console.error("Error printing receipt:", error);
        alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
      } finally {
        setPrintingId(null);
        setReceiptData(null);
      }
    }, 500);
  };

  const toggleReceiptSelection = (id: string) => {
    setSelectedReceiptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const printSelectedReceipts = () => {
    const selectedRows = transactionRows.filter((r) => selectedReceiptIds.includes(r.rowKey));
    if (selectedRows.length === 0) {
      alert("Select at least one transaction to print.");
      return;
    }
    const data = buildReceiptDataFromTransactionRows(selectedRows, new Date().toISOString());
    setPrintingId("bulk");
    setReceiptData(data);
    setTimeout(async () => {
      try {
        await printFromElement(receiptRef);
      } catch (error) {
        console.error("Error printing receipt:", error);
        alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
      } finally {
        setPrintingId(null);
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
        <div className="flex flex-col items-start sm:items-end gap-2">
          <button
            type="button"
            onClick={printSelectedReceipts}
            disabled={selectedReceiptIds.length === 0 || printingId === "bulk"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-lime-500/20 hover:bg-lime-500/30 disabled:bg-gray-600 disabled:cursor-not-allowed text-lime-300 disabled:text-gray-500 rounded-lg text-xs font-semibold transition-colors"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            {printingId === "bulk" ? "Printing..." : `Print Selected (${selectedReceiptIds.length})`}
          </button>
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
      </div>

      {!hasAny ? (
        <div className="py-8 text-center text-gray-500 text-sm">No fee records</div>
      ) : (
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x -mx-1 px-1 sm:mx-0 sm:px-0 pb-1 rounded-lg">
          <table className="w-full text-left min-w-[980px]">
            <thead>
              <tr className="text-[11px] text-gray-400 font-bold tracking-wider uppercase border-b border-white/5">
                <th className="pb-4 font-medium">PRINT</th>
                <th className="pb-4 font-medium">DATE</th>
                <th className="pb-4 font-medium">DESCRIPTION</th>
                <th className="pb-4 font-medium">FEE TYPE</th>
                <th className="pb-4 font-medium">METHOD</th>
                <th className="pb-4 font-medium">UTR / REF</th>
                <th className="pb-4 font-medium">STATUS</th>
                <th className="pb-4 font-medium text-right">AMOUNT</th>
                <th className="pb-4 font-medium text-center">RECEIPT</th>
                <th className="pb-4 w-36 min-w-[9.5rem] font-medium text-right whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {transactionRows.map((row) => {
                const payment = row.sourcePayment;
                const synthetic = isSyntheticPaymentId(row.paymentId);
                const canEditRow = Boolean(studentId.trim());
                return (
                  <tr
                    key={row.rowKey}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-4 sm:py-5">
                      <input
                        type="checkbox"
                        checked={selectedReceiptIds.includes(row.rowKey)}
                        onChange={() => toggleReceiptSelection(row.rowKey)}
                        className="h-4 w-4 rounded border-white/30 accent-lime-500"
                        aria-label={`Select ${row.feeTypeName} for receipt print`}
                      />
                    </td>
                    <td className="py-4 sm:py-5 text-gray-400 whitespace-nowrap">
                      {new Date(row.createdAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="py-4 sm:py-5 font-bold text-gray-100">
                      Fee payment
                    </td>
                    <td className="py-4 sm:py-5 text-gray-300">{row.feeTypeName}</td>
                    <td className="py-4 sm:py-5 text-gray-300">{formatPaymentMethod(row.method)}</td>
                    <td className="py-4 sm:py-5 text-gray-400">
                      {row.transactionId && row.transactionId.trim() && row.transactionId !== "N/A"
                        ? row.transactionId
                        : "-"}
                    </td>
                    <td className="py-4 sm:py-5">
                      <span className="bg-lime-400/20 text-lime-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase">
                        {row.status || "Paid"}
                      </span>
                    </td>
                    <td className="py-4 sm:py-5 text-right font-bold text-white whitespace-nowrap">
                      ₹{row.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-center">
                      <button
                        type="button"
                        onClick={() => handlePrintReceipt(row)}
                        disabled={printingId === row.rowKey}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-lime-500/20 hover:bg-lime-500/30 disabled:bg-gray-600 disabled:cursor-not-allowed text-lime-300 disabled:text-gray-500 rounded-lg text-xs font-semibold transition-colors"
                        title="Print receipt for this fee line"
                      >
                        <Printer className="w-3.5 h-3.5 shrink-0" />
                        <span>Print</span>
                      </button>
                    </td>
                    <td className="py-4 sm:py-5 w-36 min-w-[9.5rem] text-right align-middle">
                      <div className="flex justify-end gap-2 flex-nowrap shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(payment)}
                          disabled={!canEditRow}
                          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-lime-500/40 bg-lime-500/15 px-2.5 py-2 text-xs font-semibold text-lime-300 hover:bg-lime-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            synthetic
                              ? "Edit amount stored on student (admission / application fee)"
                              : "Edit payment record (full receipt)"
                          }
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4 shrink-0 text-lime-300" strokeWidth={2.25} aria-hidden />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDelete(payment)}
                          disabled={!canEditRow || deletingId === row.paymentId}
                          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-rose-400/50 bg-rose-500/20 px-2.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            synthetic
                              ? "Remove this fee from the student profile"
                              : "Delete payment record (all lines on this receipt)"
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
                    <label className="mb-1 block text-xs font-medium text-white/50">
                      Payment method (fee report column)
                    </label>
                    <select
                      value={editGateway}
                      onChange={(e) => setEditGateway(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                    >
                      {!EDIT_GATEWAY_OPTIONS.some((o) => o.value === editGateway) ? (
                        <option value={editGateway}>
                          Legacy / other: {editGateway || "—"} (choose a standard code below after this option)
                        </option>
                      ) : null}
                      {EDIT_GATEWAY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {!EDIT_GATEWAY_OPTIONS.some((o) => o.value === (editing?.method || "").trim()) ? (
                      <p className="mt-1 text-[11px] text-amber-200/90">
                        This row uses a non-standard gateway code. Select{' '}
                        <span className="font-semibold">Online (UPI / QR)</span> or{' '}
                        <span className="font-semibold">UPI</span> for digital collections, then save — the fee Excel
                        report uses this field for the Cash vs Online columns.
                      </p>
                    ) : null}
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
