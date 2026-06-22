"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, RefreshCcw } from "lucide-react";
import TimellyLoader from "../common/TimellyLoader";

type ApprovalStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

type ApprovalRow = {
  id: string;
  status: ApprovalStatus;
  totalFee: number;
  discountPercent: number;
  discountFixedAmount: number | null;
  finalFee: number;
  discountFeeHeadLabel: string | null;
  discountRemarks: string | null;
  reviewRemarks: string | null;
  reviewedAt: string | null;
  createdAt: string;
  student: {
    id: string;
    admissionNumber: string;
    user: { name: string | null } | null;
    class: { name: string; section: string | null } | null;
  };
  requestedBy: { name: string | null; email: string | null } | null;
  reviewedBy: { name: string | null; email: string | null } | null;
};

const formatMoney = (value: number | null | undefined) =>
  `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

const classLabel = (row: ApprovalRow) =>
  row.student.class
    ? [row.student.class.name, row.student.class.section].filter(Boolean).join(" - ")
    : "-";

const approvalsCache = new Map<ApprovalStatus, { data: ApprovalRow[]; ts: number }>();
const approvalsInflight = new Map<ApprovalStatus, Promise<ApprovalRow[]>>();
const APPROVALS_CACHE_MS = 5 * 60_000;
const SESSION_CACHE_KEY = "chairman:discount-approvals:v1";

type SessionApprovalCache = Partial<Record<ApprovalStatus, { data: ApprovalRow[]; ts: number }>>;

function readSessionApprovals(status: ApprovalStatus): ApprovalRow[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const store = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) ?? "{}") as SessionApprovalCache;
    const hit = store[status];
    if (!hit || Date.now() - hit.ts > APPROVALS_CACHE_MS) return null;
    approvalsCache.set(status, hit);
    return hit.data;
  } catch {
    return null;
  }
}

function writeSessionApprovals(status: ApprovalStatus, data: ApprovalRow[]): void {
  approvalsCache.set(status, { data, ts: Date.now() });
  if (typeof sessionStorage === "undefined") return;
  try {
    const store = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) ?? "{}") as SessionApprovalCache;
    store[status] = { data, ts: Date.now() };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

function clearApprovalCaches(status?: ApprovalStatus): void {
  if (status) approvalsCache.delete(status);
  else approvalsCache.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!status) {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
      return;
    }
    const store = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) ?? "{}") as SessionApprovalCache;
    delete store[status];
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

async function requestApprovals(status: ApprovalStatus): Promise<ApprovalRow[]> {
  const request =
    approvalsInflight.get(status) ??
    fetch(`/api/fees/discount-approvals?status=${status}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Failed to load approvals");
        return Array.isArray(data.approvals) ? data.approvals : [];
      })
      .finally(() => {
        approvalsInflight.delete(status);
      });

  approvalsInflight.set(status, request);
  const next = await request;
  writeSessionApprovals(status, next);
  return next;
}

export function warmDiscountApprovals(status: ApprovalStatus = "PENDING"): void {
  const cached = approvalsCache.get(status)?.data ?? readSessionApprovals(status);
  if (cached || approvalsInflight.has(status)) return;
  void requestApprovals(status).catch(() => {});
}

export default function DiscountApprovals() {
  const [status, setStatus] = useState<ApprovalStatus>("PENDING");
  const [approvals, setApprovals] = useState<ApprovalRow[]>(
    () => approvalsCache.get("PENDING")?.data ?? readSessionApprovals("PENDING") ?? []
  );
  const [loading, setLoading] = useState(() => approvals.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState<Record<string, string>>({});

  const fetchApprovals = useCallback(async (opts?: { force?: boolean }) => {
    const cached = approvalsCache.get(status)?.data ?? readSessionApprovals(status);
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

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
          <button
            type="button"
          onClick={() => void fetchApprovals({ force: true })}
          aria-label="Refresh approvals"
          title="Refresh"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as ApprovalStatus[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === item
                ? "bg-lime-400 text-black"
                : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {item === "ALL" ? "History" : item.charAt(0) + item.slice(1).toLowerCase()}
            {item === "PENDING" && status === "PENDING" ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-lime-500/30 bg-lime-500/10 p-4 text-sm text-lime-200">{success}</div>
      ) : null}

      {loading ? (
        <TimellyLoader
          title="Loading discount approvals"
          steps={["Requests", "Students", "Approval status"]}
          compact
        />
      ) : approvals.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/3 p-8 text-center text-white/60">
          No {status === "ALL" ? "history" : status.toLowerCase()} discount requests found.
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => {
            const discountAmount =
              approval.discountFixedAmount ?? Math.max(approval.totalFee - approval.finalFee, 0);
            return (
              <div key={approval.id} className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-white">
                        {approval.student.user?.name || "Student"}
                      </h2>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60">
                        {approval.student.admissionNumber}
                      </span>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60">
                        {classLabel(approval)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-white/60">
                      Requested by {approval.requestedBy?.name || approval.requestedBy?.email || "-"} on{" "}
                      {new Date(approval.createdAt).toLocaleDateString("en-IN")}
                    </p>
                    <p className="mt-2 text-sm text-white/70">
                      Head: <span className="text-white">{approval.discountFeeHeadLabel || "Overall"}</span>
                    </p>
                    {approval.discountRemarks ? (
                      <p className="mt-1 text-sm text-white/60">Reason: {approval.discountRemarks}</p>
                    ) : null}
                  </div>

                  <div className="grid min-w-[260px] grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-white/50">Total Fee</p>
                      <p className="font-semibold text-white">{formatMoney(approval.totalFee)}</p>
                    </div>
                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-white/50">Discount</p>
                      <p className="font-semibold text-cyan-200">
                        {formatMoney(discountAmount)} ({approval.discountPercent.toFixed(2)}%)
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-white/50">Final Fee</p>
                      <p className="font-semibold text-lime-200">{formatMoney(approval.finalFee)}</p>
                    </div>
                    <div className="rounded-xl bg-black/20 p-3">
                      <p className="text-white/50">Status</p>
                      <p className="font-semibold text-white">{approval.status}</p>
                    </div>
                  </div>
                </div>

                {approval.status === "PENDING" ? (
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                    <input
                      value={reviewRemarks[approval.id] || ""}
                      onChange={(e) =>
                        setReviewRemarks((prev) => ({ ...prev, [approval.id]: e.target.value }))
                      }
                      placeholder="Chairman remarks (optional)"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-lime-400/70"
                    />
                    <button
                      type="button"
                      disabled={busyId === approval.id}
                      onClick={() => void review(approval.id, "APPROVE")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-bold text-black disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === approval.id}
                      onClick={() => void review(approval.id, "REJECT")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
                      Reviewed by {approval.reviewedBy?.name || approval.reviewedBy?.email || "-"}
                      {approval.reviewedAt ? ` on ${new Date(approval.reviewedAt).toLocaleDateString("en-IN")}` : ""}
                      {approval.reviewRemarks ? `: ${approval.reviewRemarks}` : ""}
                    </div>
                    {approval.status === "APPROVED" ? (
                      <button
                        type="button"
                        disabled={busyId === approval.id}
                        onClick={() => void review(approval.id, "REVERT")}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/15 px-4 py-2.5 text-sm font-bold text-amber-100 hover:bg-amber-400/25 disabled:opacity-60"
                      >
                        <RefreshCcw className="h-4 w-4" />
                        Revert Discount
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
