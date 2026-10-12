import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearApprovalCaches,
  getCachedApprovals,
  readSessionApprovals,
  requestApprovals,
  type ApprovalRow,
  type ApprovalStatus,
} from "./discountApprovalsCache";

export function useDiscountApprovalsState() {
  const [status, setStatus] = useState<ApprovalStatus>("PENDING");
  const [approvals, setApprovals] = useState<ApprovalRow[]>(
    () => getCachedApprovals("PENDING") ?? readSessionApprovals("PENDING") ?? []
  );
  const [loading, setLoading] = useState(() => approvals.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [reviewRemarks, setReviewRemarks] = useState<Record<string, string>>({});

  const fetchApprovals = useCallback(async (opts?: { force?: boolean }) => {
    const cached = getCachedApprovals(status) ?? readSessionApprovals(status);
    if (!opts?.force && cached) {
      setApprovals(cached);
      setLoading(false);
      void requestApprovals(status)
        .then(setApprovals)
        .catch(() => {});
      return;
    }

    setLoading(!cached);
    setError(null);
    try {
      const next = await requestApprovals(status);
      setApprovals(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void fetchApprovals();
  }, [fetchApprovals]);

  const pendingCount = useMemo(
    () => approvals.filter((approval) => approval.status === "PENDING").length,
    [approvals]
  );
  const visibleDiscountTotal = useMemo(
    () =>
      approvals.reduce(
        (sum, approval) =>
          sum + (approval.discountFixedAmount ?? Math.max(approval.totalFee - approval.finalFee, 0)),
        0
      ),
    [approvals]
  );
  const filteredApprovals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return approvals;
    return approvals.filter((approval) => {
      const haystack = [
        approval.student.user?.name,
        approval.student.admissionNumber,
        approval.student.fatherName,
        approval.student.class?.name,
        approval.student.class?.section,
        approval.discountFeeHeadLabel,
        approval.discountRemarks,
        approval.requestedBy?.name,
        approval.requestedBy?.email,
        approval.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [approvals, search]);
  const studentSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !searchFocused) return [];
    const byId = new Map<string, ApprovalRow>();
    for (const approval of approvals) {
      const haystack = [
        approval.student.user?.name,
        approval.student.admissionNumber,
        approval.student.fatherName,
        approval.student.class?.name,
        approval.student.class?.section,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q) && !byId.has(approval.student.id)) {
        byId.set(approval.student.id, approval);
      }
    }
    return Array.from(byId.values()).slice(0, 8);
  }, [approvals, search, searchFocused]);

  const review = async (id: string, action: "APPROVE" | "REJECT" | "REVERT") => {
    if (
      action === "REVERT" &&
      !window.confirm(
        "Are you sure you want to revert this approved discount? The discount amount will be added back to the student's fee."
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    setSuccess(null);
    const previous = approvals;
    const nextStatus: ApprovalStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    setApprovals((rows) => rows.filter((row) => row.id !== id));
    try {
      const res = await fetch(`/api/fees/discount-approvals/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewRemarks: reviewRemarks[id] || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to review discount");
      clearApprovalCaches("ALL");
      clearApprovalCaches("PENDING");
      clearApprovalCaches(nextStatus);
      setSuccess(
        data.message ||
          (action === "APPROVE"
            ? "Discount approved."
            : action === "REVERT"
              ? "Discount reverted."
              : "Discount rejected.")
      );
      setReviewRemarks((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      void fetchApprovals({ force: true });
    } catch (err) {
      setApprovals(previous);
      setError(err instanceof Error ? err.message : "Failed to review discount");
    } finally {
      setBusyId(null);
    }
  };

  return {
    status,
    setStatus,
    loading,
    busyId,
    error,
    success,
    search,
    setSearch,
    searchFocused,
    setSearchFocused,
    reviewRemarks,
    setReviewRemarks,
    fetchApprovals,
    pendingCount,
    visibleDiscountTotal,
    filteredApprovals,
    studentSuggestions,
    review,
  };
}
