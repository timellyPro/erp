import { RefreshCcw, Search } from "lucide-react";
import { classLabel, type ApprovalRow, type ApprovalStatus } from "./discountApprovalsCache";

export function DiscountApprovalsSearchHeader({
  search,
  setSearch,
  setSearchFocused,
  studentSuggestions,
  onRefresh,
  status,
  setStatus,
  pendingCount,
}: {
  search: string;
  setSearch: (v: string) => void;
  setSearchFocused: (v: boolean) => void;
  studentSuggestions: ApprovalRow[];
  onRefresh: () => void;
  status: ApprovalStatus;
  setStatus: (s: ApprovalStatus) => void;
  pendingCount: number;
}) {
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white">Discount Approvals</h2>
          <p className="mt-1 text-sm text-white/45">Review fee discounts requested by school admin.</p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="relative w-full max-w-[220px] sm:w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              placeholder="Search student..."
              className="h-9 w-full rounded-full border border-white/10 bg-white/5 pl-9 pr-3 text-xs font-medium text-white outline-none placeholder:text-white/30 focus:border-lime-400/60"
            />
            {studentSuggestions.length > 0 ? (
              <div className="absolute right-0 top-11 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0F172A] shadow-2xl">
                {studentSuggestions.map((approval) => {
                  const name = approval.student.user?.name || "Student";
                  const klass = classLabel(approval);
                  const father = approval.student.fatherName?.trim() || "-";
                  return (
                    <button
                      key={approval.student.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSearch(name);
                        setSearchFocused(false);
                      }}
                      className="w-full border-b border-white/5 px-4 py-3 text-left last:border-0 hover:bg-white/5"
                    >
                      <p className="text-sm font-bold text-white">{name}</p>
                      <p className="mt-1 text-xs text-white/50">
                        {approval.student.admissionNumber || "-"} | {klass} | Father: {father}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh approvals"
            title="Refresh"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as ApprovalStatus[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              status === item
                ? "bg-lime-400 text-black shadow-lg shadow-lime-950/25"
                : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {item === "ALL" ? "History" : item.charAt(0) + item.slice(1).toLowerCase()}
            {item === "PENDING" && status === "PENDING" ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>
    </>
  );
}
