"use client";

import TimellyLoader from "../common/TimellyLoader";
import { formatMoney } from "./shared";
import { useDiscountApprovalsState } from "./shared";
import { DiscountApprovalsSearchHeader } from "./shared";
import { DiscountApprovalCard } from "./shared";

export { warmDiscountApprovals } from "./shared";

export default function DiscountApprovals() {
  const {
    status,
    setStatus,
    loading,
    busyId,
    error,
    success,
    search,
    setSearch,
    setSearchFocused,
    reviewRemarks,
    setReviewRemarks,
    fetchApprovals,
    pendingCount,
    visibleDiscountTotal,
    filteredApprovals,
    studentSuggestions,
    review,
  } = useDiscountApprovalsState();

  return (
    <div className="space-y-5">
      <DiscountApprovalsSearchHeader
        search={search}
        setSearch={setSearch}
        setSearchFocused={setSearchFocused}
        studentSuggestions={studentSuggestions}
        onRefresh={() => void fetchApprovals({ force: true })}
        status={status}
        setStatus={setStatus}
        pendingCount={pendingCount}
      />

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
      ) : filteredApprovals.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/3 p-8 text-center text-white/60">
          {search.trim()
            ? "No discount requests match your search."
            : `No ${status === "ALL" ? "history" : status.toLowerCase()} discount requests found.`}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredApprovals.map((approval) => (
            <DiscountApprovalCard
              key={approval.id}
              approval={approval}
              busyId={busyId}
              reviewRemarks={reviewRemarks}
              setReviewRemarks={setReviewRemarks}
              onReview={(id, action) => void review(id, action)}
            />
          ))}
        </div>
      )}
      {!loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/40">Showing</p>
            <p className="mt-1 text-2xl font-black text-white">{filteredApprovals.length}</p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-white/5 p-4">
            <p className="text-xs text-white/40">Discount Value</p>
            <p className="mt-1 text-lg font-black text-amber-200">{formatMoney(visibleDiscountTotal)}</p>
          </div>
          <div className="rounded-2xl border border-lime-400/20 bg-white/5 p-4">
            <p className="text-xs text-white/40">Current Filter</p>
            <p className="mt-1 text-lg font-black text-lime-200">{status === "ALL" ? "History" : status}</p>
          </div>
          <div className="rounded-2xl border border-sky-400/20 bg-white/5 p-4">
            <p className="text-xs text-white/40">Pending Here</p>
            <p className="mt-1 text-2xl font-black text-sky-200">{pendingCount}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
