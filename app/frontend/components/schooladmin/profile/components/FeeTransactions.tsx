import { Receipt, Printer, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import FeePaymentReceiptTemplate, {
  type FeePaymentReceiptData,
} from "../../../pdf/FeePaymentReceiptTemplate";
import { printFromElement } from "@/lib/pdfUtils";
import { formatReceiptGeneratedDate, formatReceiptTransactionDate } from "@/lib/receiptDates";
import { formatResidencyTypeForDisplay } from "@/lib/residencyDisplay";
import { isOfflinePaymentGateway } from "@/lib/feePaymentGateway";
import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";

type PaymentFeeAllocationLine = { name: string; amount: number };

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
  transactionId: string | null;
  collectedByName?: string | null;
  collectedByUserId?: string | null;
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
  collectedByName: string | null;
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
      collectedByName: payment.collectedByName ?? null,
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
  /** When present, totals prefer breakdown (matches fee head cards). */
  feeBreakdown?: AdminStudentFeeBreakdownResult | null;
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
  onPaymentDeleted?: (result: {
    paymentId: string;
    updatedFee: { amountPaid: number; remainingFee: number; finalFee?: number } | null;
    feeAllocations?: Array<{ name: string; amount: number; key?: string }>;
  }) => void;
  feesRecordingDisabled?: boolean;
  /** True while payment history is still loading from the server. */
  transactionsLoading?: boolean;
  /** After recording a payment, auto-open its receipt once rows are ready. */
  autoPrintPaymentId?: string | null;
  onAutoPrintDone?: () => void;
};

function isSyntheticPaymentId(id: string) {
  return id === "admission-fee" || id === "application-fee";
}

function isPendingPaymentId(id: string) {
  return id.startsWith("pending-");
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
  feeBreakdown = null,
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
  onPaymentDeleted,
  feesRecordingDisabled = false,
  transactionsLoading = false,
  autoPrintPaymentId = null,
  onAutoPrintDone,
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

  const hasAdmissionPayment = basePayments.some(
    (p) =>
      p.id === "admission-fee" ||
      p.id.startsWith("admission-app-") ||
      (p.feeTypeName ?? "").toLowerCase().includes("admission fee")
  );
  const hasApplicationPayment = basePayments.some(
    (p) =>
      p.id === "application-fee" ||
      p.id.startsWith("application-app-") ||
      (p.feeTypeName ?? "").toLowerCase().includes("application fee")
  );

  if (!hasAdmissionPayment && admissionFee && admissionFee > 0) {
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

  if (!hasApplicationPayment && applicationFee && applicationFee > 0) {
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

  const autoPrintStartedRef = useRef<string | null>(null);

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

    if (isPendingPaymentId(p.id)) {
      onPaymentDeleted?.({
        paymentId: p.id,
        updatedFee: null,
        feeAllocations: p.feeAllocations,
      });
      return;
    }

    setDeletingId(p.id);
    try {
      const qs = studentId.trim()
        ? `?studentId=${encodeURIComponent(studentId.trim())}`
        : "";
      const res = await fetch(`/api/fees/payment/${encodeURIComponent(p.id)}${qs}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          onPaymentDeleted?.({
            paymentId: p.id,
            updatedFee: null,
            feeAllocations: p.feeAllocations,
          });
          return;
        }
        alert(typeof data.message === "string" ? data.message : "Delete failed");
        return;
      }
      onPaymentDeleted?.({
        paymentId: p.id,
        updatedFee:
          data.updatedFee && typeof data.updatedFee.amountPaid === "number"
            ? {
                amountPaid: Number(data.updatedFee.amountPaid),
                remainingFee: Number(data.updatedFee.remainingFee),
                finalFee:
                  typeof data.updatedFee.finalFee === "number" ? data.updatedFee.finalFee : undefined,
              }
            : null,
        feeAllocations: p.feeAllocations,
      });
    } catch {
      alert("Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const txnPaid = transactionRows
    .filter((r) => isSuccessStatus(r.status))
    .reduce((s, r) => s + r.amount, 0);
  const totalPaid = Math.max(
    feeBreakdown?.amountPaid ?? 0,
    hasFee ? fee!.amountPaid : 0,
    txnPaid
  );
  const total =
    feeBreakdown?.totalAmount ??
    (hasFee ? Math.max(fee!.amountPaid + fee!.remainingFee, totalPaid) : totalPaid);
  const hasAny = hasFee || transactionRows.length > 0;

  const simplifyFeeHeadName = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "Fee";
    const lower = raw.toLowerCase();
    if (lower.includes("tuition")) return "Tuition Fee";
    if (lower.includes("mess")) return "Mess Fee";
    if (lower.includes("hostel") || lower.includes("hostler") || lower.includes("boarding")) {
      return "Hostel Fee";
    }
    if (lower.includes("transport")) return "Transportation Fee";
    const cleaned = raw
      .replace(/\b\d+(st|nd|rd|th)\s*installment\b/gi, "")
      .replace(/\binstallment\b/gi, "")
      .replace(/\s*-\s*[\w\s]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned || raw;
  };

  type ReceiptLine = {
    description: string;
    amount: number;
    paymentMethod: string;
    utrNo: string;
  };

  /** Merge same fee head + same payment method; keep separate rows when method differs (e.g. Cash vs Online). */
  const mergeReceiptLinesByDescription = (lines: ReceiptLine[]): ReceiptLine[] => {
    const merged = new Map<
      string,
      { description: string; amount: number; paymentMethod: string; utrNos: Set<string> }
    >();

    for (const line of lines) {
      const key = `${line.description}::${line.paymentMethod}`;
      const existing = merged.get(key);
      if (existing) {
        existing.amount += line.amount;
        if (line.utrNo && line.utrNo !== "-") existing.utrNos.add(line.utrNo);
      } else {
        merged.set(key, {
          description: line.description,
          amount: line.amount,
          paymentMethod: line.paymentMethod,
          utrNos: new Set(line.utrNo && line.utrNo !== "-" ? [line.utrNo] : []),
        });
      }
    }

    return Array.from(merged.values()).map(({ description, amount, paymentMethod, utrNos }) => ({
      description,
      amount,
      paymentMethod,
      utrNo:
        utrNos.size === 0 ? "-" : utrNos.size === 1 ? [...utrNos][0]! : [...utrNos].join(", "),
    }));
  };

  const buildReceiptDataFromTransactionRows = (
    selectedRows: TransactionDisplayRow[],
    transactionDate: string,
    generatedOn: string
  ) => {
    const rawLines = selectedRows.map((row) => {
      const currentRef =
        row.transactionId?.trim() && row.transactionId !== "N/A" ? row.transactionId.trim() : "-";
      return {
        description: simplifyFeeHeadName(row.feeTypeName),
        amount: row.amount,
        paymentMethod: formatPaymentMethod(row.method),
        utrNo: currentRef,
      };
    });
    const groupedLines = mergeReceiptLinesByDescription(rawLines);
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
      transactionDate,
      generatedOn,
      lines: groupedLines,
      total: finalTotal,
      receiptTitle,
    } satisfies FeePaymentReceiptData;
  };

  const handlePrintReceipt = async (row: TransactionDisplayRow) => {
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const data = buildReceiptDataFromTransactionRows([row], row.createdAt, generatedOn);

    setPrintingId(row.rowKey);
    flushSync(() => {
      setReceiptData(data);
    });

    try {
      await printFromElement(receiptRef, { minHeight: 400 });
    } catch (error) {
      console.error("Error printing receipt:", error);
      alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
    } finally {
      setPrintingId(null);
      setReceiptData(null);
    }
  };

  useEffect(() => {
    if (!autoPrintPaymentId || transactionsLoading) return;
    if (autoPrintStartedRef.current === autoPrintPaymentId) return;
    const rowsForPayment = transactionRows.filter((r) => r.paymentId === autoPrintPaymentId);
    if (rowsForPayment.length === 0) return;

    autoPrintStartedRef.current = autoPrintPaymentId;
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const transactionDate = rowsForPayment[0]?.createdAt ?? new Date().toISOString();
    const data = buildReceiptDataFromTransactionRows(rowsForPayment, transactionDate, generatedOn);

    void (async () => {
      setPrintingId(autoPrintPaymentId);
      flushSync(() => {
        setReceiptData(data);
      });
      try {
        await printFromElement(receiptRef, { minHeight: 400 });
      } catch (error) {
        console.error("Error printing receipt:", error);
        alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
      } finally {
        setPrintingId(null);
        setReceiptData(null);
        onAutoPrintDone?.();
      }
    })();
  }, [autoPrintPaymentId, onAutoPrintDone, transactionRows, transactionsLoading]);

  const toggleReceiptSelection = (id: string) => {
    setSelectedReceiptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const printSelectedReceipts = async () => {
    const selectedRows = transactionRows.filter((r) => selectedReceiptIds.includes(r.rowKey));
    if (selectedRows.length === 0) {
      alert("Select at least one transaction to print.");
      return;
    }
    const latestTxDate = selectedRows.reduce((max, row) => {
      const t = new Date(row.createdAt).getTime();
      return t > max ? t : max;
    }, 0);
    const transactionDate =
      latestTxDate > 0 ? new Date(latestTxDate).toISOString() : new Date().toISOString();
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const data = buildReceiptDataFromTransactionRows(selectedRows, transactionDate, generatedOn);
    setPrintingId("bulk");
    flushSync(() => {
      setReceiptData(data);
    });
    try {
      await printFromElement(receiptRef, { minHeight: 400 });
    } catch (error) {
      console.error("Error printing receipt:", error);
      alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
    } finally {
      setPrintingId(null);
      setReceiptData(null);
    }
  };

  return (
    <div
      id="student-profile-fees-section"
      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-3 sm:p-6 mt-4 sm:mt-6 min-w-0 w-full scroll-mt-28 sm:scroll-mt-24"
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

      {!transactionsLoading && !hasAny ? (
        <div className="py-8 text-center text-gray-500 text-sm">No fee records</div>
      ) : transactionsLoading && transactionRows.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">Loading transaction history…</div>
      ) : (
        <div className="overflow-x-hidden w-full">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] sm:text-[11px] text-gray-400 font-bold tracking-wider uppercase border-b border-white/5">
                <th className="pb-3 pr-2 w-8 font-medium" aria-label="Select" />
                <th className="pb-3 px-2 font-medium whitespace-nowrap">Date</th>
                <th className="pb-3 px-2 font-medium min-w-0">Fee type</th>
                <th className="pb-3 px-2 font-medium whitespace-nowrap">Method</th>
                <th className="pb-3 px-2 font-medium min-w-0 hidden md:table-cell">Collected by</th>
                <th className="pb-3 px-2 font-medium min-w-0 hidden lg:table-cell">UTR / Ref</th>
                <th className="pb-3 px-2 font-medium whitespace-nowrap">Status</th>
                <th className="pb-3 px-2 font-medium text-right whitespace-nowrap">Amount</th>
                <th className="pb-3 pl-2 font-medium text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactionRows.map((row) => {
                const payment = row.sourcePayment;
                const synthetic = isSyntheticPaymentId(row.paymentId);
                const canEditRow = Boolean(studentId.trim()) && !feesRecordingDisabled;
                return (
                  <tr
                    key={row.rowKey}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 pr-1 align-top">
                      <input
                        type="checkbox"
                        checked={selectedReceiptIds.includes(row.rowKey)}
                        onChange={() => toggleReceiptSelection(row.rowKey)}
                        className="h-4 w-4 rounded border-white/30 accent-lime-500"
                        aria-label={`Select ${row.feeTypeName} for receipt print`}
                      />
                    </td>
                    <td className="py-3 px-1 text-gray-400 text-xs sm:text-sm whitespace-nowrap align-top">
                      {formatReceiptTransactionDate(row.createdAt)}
                    </td>
                    <td className="py-3 px-1 text-gray-200 text-xs sm:text-sm leading-snug break-words align-top">
                      {row.feeTypeName}
                    </td>
                    <td className="py-3 px-1 text-gray-300 text-xs sm:text-sm whitespace-nowrap align-top">
                      {formatPaymentMethod(row.method)}
                    </td>
                    <td className="py-3 px-1 text-gray-300 text-xs sm:text-sm leading-snug break-words align-top hidden md:table-cell">
                      {isOfflinePaymentGateway(row.method) ? row.collectedByName || "—" : "—"}
                    </td>
                    <td className="py-3 px-1 text-gray-400 text-xs sm:text-sm break-all align-top hidden lg:table-cell">
                      {row.transactionId && row.transactionId.trim() && row.transactionId !== "N/A"
                        ? row.transactionId
                        : "-"}
                    </td>
                    <td className="py-3 px-1 align-top">
                      <span className="inline-block bg-lime-400/20 text-lime-400 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full uppercase whitespace-nowrap">
                        {row.status || "Paid"}
                      </span>
                    </td>
                    <td className="py-3 px-1 text-right font-bold text-white text-xs sm:text-sm whitespace-nowrap align-top">
                      ₹{row.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 pl-1 text-right align-top">
                      <div className="flex justify-end gap-1 sm:gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handlePrintReceipt(row)}
                          disabled={printingId === row.rowKey}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-lime-500/30 bg-lime-500/15 px-2 py-1.5 text-[11px] font-semibold text-lime-300 hover:bg-lime-500/25 disabled:opacity-40"
                          title="Print receipt"
                        >
                          <Printer className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden xl:inline">Print</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(payment)}
                          disabled={!canEditRow}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-lime-500/40 bg-lime-500/15 px-2 py-1.5 text-[11px] font-semibold text-lime-300 hover:bg-lime-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                          title={synthetic ? "Edit fee amount" : "Edit payment"}
                        >
                          <Pencil className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                          <span className="hidden xl:inline">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDelete(payment)}
                          disabled={!canEditRow || deletingId === row.paymentId}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-400/50 bg-rose-500/20 px-2 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                          title={synthetic ? "Remove fee" : "Delete payment"}
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                          <span className="hidden xl:inline">Delete</span>
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
