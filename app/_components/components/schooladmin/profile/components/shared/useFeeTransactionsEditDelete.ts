import { useState } from "react";
import { isPendingPaymentId, isSuccessStatus, isSyntheticPaymentId } from "./feeTransactionsHelpers";
import type { PaymentRow } from "./feeTransactionsTypes";
import type { FeeTransactionsProps as Props } from "./feeTransactionsTypes";

export function useFeeTransactionsEditDelete({
  studentId = "",
  onPaymentsChanged,
  onPaymentDeleted,
}: Pick<Props, "studentId" | "onPaymentsChanged" | "onPaymentDeleted">) {
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editGateway, setEditGateway] = useState("");
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  return {
    editing,
    editAmount,
    setEditAmount,
    editRef,
    setEditRef,
    editGateway,
    setEditGateway,
    editDate,
    setEditDate,
    saving,
    deletingId,
    openEdit,
    closeEdit,
    saveEdit,
    confirmDelete,
  };
}
