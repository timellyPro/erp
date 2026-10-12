import { useState } from "react";
import type { HeadCard } from "./feesBreakdownHelpers";

export function useExtraFeeHeadActions({ onFeeModified }: { onFeeModified?: () => void }) {
  const [editExtra, setEditExtra] = useState<{
    id: string;
    name: string;
    amount: number;
    splitIntoTwoInstallments?: boolean;
  } | null>(null);
  const [deletingExtraId, setDeletingExtraId] = useState<string | null>(null);

  const editExtraFeeHead = (h: HeadCard) => {
    if (!h.extraFeeId) return;
    setEditExtra({
      id: h.extraFeeId,
      name: h.extraFeeNameForEdit ?? h.label,
      amount: h.extraFeeFullAmount ?? h.amount,
      splitIntoTwoInstallments: h.splitIntoTwoInstallments,
    });
  };

  const deleteExtraFeeHead = async (h: HeadCard) => {
    if (!h.extraFeeId) return;
    const feeTitle = h.extraFeeNameForEdit ?? h.label;
    const msg = h.canDeleteExtra
      ? `Remove extra fee "${feeTitle}" for this student? Their total due will be reduced by the full fee amount.`
      : `Delete fee "${feeTitle}" from the catalog? This removes it for every student in its scope (school / class / section), not only this profile.`;
    if (!confirm(msg)) {
      return;
    }
    try {
      setDeletingExtraId(h.extraFeeId);
      const res = await fetch(`/api/fees/extra/${encodeURIComponent(h.extraFeeId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.message === "string" ? data.message : "Delete failed");
        return;
      }
      onFeeModified?.();
    } catch {
      alert("Delete failed");
    } finally {
      setDeletingExtraId(null);
    }
  };

  return {
    editExtra,
    setEditExtra,
    deletingExtraId,
    editExtraFeeHead,
    deleteExtraFeeHead,
  };
}
