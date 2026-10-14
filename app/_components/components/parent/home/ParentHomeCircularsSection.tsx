"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SearchInput from "../../common/SearchInput";
import CircularNoticeCard from "../../common/CircularNoticeCard";
import { ParentCircular } from "./types";

const ACCENT_COLORS = ["bg-red-500", "bg-yellow-400", "bg-blue-500", "bg-lime-400"];
const IMPORTANCE_FILTERS = ["all", "high", "medium", "low"] as const;

type ImportanceFilter = (typeof IMPORTANCE_FILTERS)[number];

type Props = {
  circulars: ParentCircular[];
};

function normalizeImportance(value?: string | null): ImportanceFilter {
  const lower = value?.toLowerCase();
  if (lower === "high" || lower === "medium" || lower === "low") return lower;
  return "medium";
}

export default function ParentHomeCircularsSection({ circulars }: Props) {
  const [search, setSearch] = useState("");
  const [importance, setImportance] = useState<ImportanceFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 3;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return circulars.filter((item) => {
      const itemImportance = normalizeImportance(item.importanceLevel);
      const matchImportance = importance === "all" ? true : importance === itemImportance;
      const matchQuery =
        query.length === 0
          ? true
          : item.subject.toLowerCase().includes(query) ||
            item.referenceNumber.toLowerCase().includes(query) ||
            item.content.toLowerCase().includes(query);
      return matchImportance && matchQuery;
    });
  }, [circulars, importance, search]);

  useEffect(() => {
    setPage(1);
  }, [importance, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedCirculars = filtered.slice(startIndex, endIndex);

  return (
    <section className="space-y-4 sm:space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <span className="w-1 sm:w-1.5 h-8 sm:h-12 rounded-full bg-lime-400 mt-1 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">Circulars & Notices</h3>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1 hidden sm:block">Create and manage school-wide circulars</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full md:w-auto">
          <div className="w-full lg:max-w-md min-w-0">
            <SearchInput
              value={search}
              onChange={setSearch}
              icon={Search}
              showSearchIcon
              placeholder="Search circulars.."
              variant="glass"
              className="text-sm"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 sm:mx-0 sm:overflow-visible sm:pb-0 no-scrollbar">
            {IMPORTANCE_FILTERS.map((filter) => {
              const active = importance === filter;
              const label =
                filter === "all"
                  ? "All Importance"
                  : `${filter.charAt(0).toUpperCase()}${filter.slice(1)}`;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setImportance(filter)}
                  className={`h-[38px] sm:h-[42px] px-3 sm:px-4 border rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 ${
                    active
                      ? "bg-lime-400/10 text-lime-300 border-lime-400/40"
                      : "bg-white/5 text-white/60 border-white/15 hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
          No circulars found for the selected filters.
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {pagedCirculars.map((c, index) => (
              <CircularNoticeCard
                key={c.id}
                referenceNumber={c.referenceNumber}
                subject={c.subject}
                content={c.content}
                publishStatus={c.publishStatus}
                date={c.date}
                issuedBy={c.issuedBy?.name ?? "School Admin"}
                attachments={c.attachments}
                accentClassName={ACCENT_COLORS[index % ACCENT_COLORS.length]}
              />
            ))}
          </div>

          {filtered.length > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-white/70">
              <div className="text-xs">
                Showing {Math.min(startIndex + 1, filtered.length)}-
                {Math.min(endIndex, filtered.length)} of {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10"
                >
                  Prev
                </button>
                <div className="text-xs">
                  Page {safePage} of {totalPages}
                </div>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
