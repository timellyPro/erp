"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../common/PageHeader";
import { formatAmount } from "../../utils/format";
import SearchInput from "../common/SearchInput";
import TableLayout from "../common/TableLayout";
import { Column } from "../../types/superadmin";
import Spinner from "../common/Spinner";
import { fetchSuperadminSchools } from "@/lib/api/superadminSchools";
import { useDebounce } from "@/app/_components/hooks/useDebounce";

interface SchoolTurnover {
  slNo: number;
  id: string;
  name: string;
  turnover: number;
  studentCount: number;
}

export default function Transactions() {
  const PAGE_SIZE = 10;
  const [schools, setSchools] = useState<SchoolTurnover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalTransactionCount, setTotalTransactionCount] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetchSuperadminSchools(new URLSearchParams())
      .then(({ ok, data }) => {
        if (!ok) throw new Error("Failed to load");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const rawSchools = (data.schools ?? []) as Array<{
          slNo: number;
          id: string;
          name: string;
          turnover: number;
          studentCount: number;
        }>;
        const list = rawSchools.map((s, i) => ({
          slNo: i + 1,
          id: s.id,
          name: s.name,
          turnover: s.turnover ?? 0,
          studentCount: s.studentCount ?? 0,
        }));
        setSchools(list);
        setTotalTransactionCount((data as { totalTransactionCount?: number }).totalTransactionCount ?? 0);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSchools = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return schools;
    return schools.filter((s) => s.name.toLowerCase().includes(term));
  }, [schools, debouncedSearch]);
  const totalPages = Math.max(1, Math.ceil(filteredSchools.length / PAGE_SIZE));
  const paginatedSchools = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredSchools.slice(start, start + PAGE_SIZE);
  }, [filteredSchools, page]);

  const totalTurnover = filteredSchools.reduce((s, r) => s + r.turnover, 0);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const columns = useMemo<Column<SchoolTurnover>[]>(
    () => [
      {
        header: "Sl. No",
        align: "center",
        render: (_row, index) => (page - 1) * PAGE_SIZE + index + 1,
      },
      {
        header: "School",
        render: (s) => s.name,
      },
      {
        header: "Students",
        align: "center",
        render: (s) => s.studentCount.toLocaleString(),
      },
      {
        header: "Turnover",
        align: "center",
        render: (s) => (
          <span className="text-lime-300 font-medium">
            {formatAmount(s.turnover)}
          </span>
        ),
      },
    ],
    [page]
  );

  return (
    <main className="flex-1 overflow-y-auto flex flex-col items-center">
      <div className="w-full min-h-screen space-y-4 sm:space-y-6 px-3 sm:px-4 md:px-6">
        <PageHeader
          title="Fees Transactions"
          subtitle="Turnover (total amount) per school"
          className="[&>div:first-child>p]:whitespace-nowrap"
          rightSlot={
            <div className="w-full md:w-[24rem]">
              <SearchInput
                value={search}
                onChange={setSearch}
                icon={Search}
                iconPosition="right"
                placeholder="Search school"
                variant="glass"
              />
            </div>
          }
        />

        {error && <div className="text-red-400 text-sm py-2">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            <TableLayout
              columns={columns}
              data={paginatedSchools}
              emptyText="No schools found"
              rowKey={(row) => row.id}
              pagination={{
                page,
                totalPages,
                onChange: setPage,
              }}
            />

            {filteredSchools.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-white/80">
                <span>
                  Total transactions: <strong className="text-white">{totalTransactionCount.toLocaleString()}</strong>
                </span>
                <span>
                  Total amount: <strong className="text-white">{formatAmount(totalTurnover)}</strong>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
