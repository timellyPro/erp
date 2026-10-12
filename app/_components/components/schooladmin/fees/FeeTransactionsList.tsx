"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import RefundModal from "./RefundModal";
import type { Class } from "./types";
import {
  schoolAdminStudentDetailsFeesUrl,
  warmSchoolAdminStudentDetails,
} from "./studentDetailsNav";
import InlinePagination from "../schooladmincomponents/InlinePagination";
import { useFeeTransactionsListState, FeeTransactionsFilters, FeeTransactionsMobileList, FeeTransactionsTable } from "./shared/fee-transactions-list";

interface FeeTransactionsListProps {
  schoolId: string | null;
  classes: Class[];
  onSuccess: () => void;
}

export default function FeeTransactionsList({
  schoolId,
  classes,
  onSuccess,
}: FeeTransactionsListProps) {
  const router = useRouter();
  const {
    PAGE_SIZE,
    loading,
    sectionLoading,
    selectedClassId,
    setSelectedClassId,
    selectedSection,
    setSelectedSection,
    selectedYear,
    setSelectedYear,
    studentSearch,
    setStudentSearch,
    refundTarget,
    setRefundTarget,
    page,
    setPage,
    collectorOptions,
    selectedCollectorUserId,
    setSelectedCollectorUserId,
    sectionOptions,
    yearOptions,
    filteredTransactions,
    totalPages,
    paginatedTransactions,
    onRefundSuccess,
  } = useFeeTransactionsListState({ schoolId, classes, onSuccess });

  const openStudent = (studentId: string) => router.push(schoolAdminStudentDetailsFeesUrl(studentId));
  const prefetchStudent = (studentId: string) => {
    warmSchoolAdminStudentDetails(studentId);
    router.prefetch(schoolAdminStudentDetailsFeesUrl(studentId));
  };

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold mb-4 flex flex-wrap items-center gap-2">
        <RotateCcw className="w-5 h-5 shrink-0 text-amber-400" />
        <span>
          {`Fee Transactions & Refunds (${filteredTransactions.length}${
            filteredTransactions.length > PAGE_SIZE
              ? ` · rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredTransactions.length)}`
              : ""
          })`}
        </span>
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        View successful payments and process refunds when needed.
      </p>

      <FeeTransactionsFilters
        studentSearch={studentSearch}
        setStudentSearch={setStudentSearch}
        selectedCollectorUserId={selectedCollectorUserId}
        setSelectedCollectorUserId={setSelectedCollectorUserId}
        collectorOptions={collectorOptions}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        yearOptions={yearOptions}
        selectedClassId={selectedClassId}
        setSelectedClassId={setSelectedClassId}
        classes={classes}
        selectedSection={selectedSection}
        setSelectedSection={setSelectedSection}
        sectionLoading={sectionLoading}
        sectionOptions={sectionOptions}
      />

      {loading ? (
        <div className="py-8 text-center text-gray-400">Loading transactions...</div>
      ) : filteredTransactions.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No transactions found</div>
      ) : (
        <>
          <FeeTransactionsMobileList
            transactions={paginatedTransactions}
            onOpenStudent={openStudent}
            onPrefetchStudent={prefetchStudent}
            onRefund={setRefundTarget}
          />
          <FeeTransactionsTable
            transactions={paginatedTransactions}
            onOpenStudent={openStudent}
            onPrefetchStudent={prefetchStudent}
            onRefund={setRefundTarget}
          />
          <div className="mt-4">
            <InlinePagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        </>
      )}

      <RefundModal
        transaction={refundTarget}
        onClose={() => setRefundTarget(null)}
        onSuccess={onRefundSuccess}
      />
    </section>
  );
}
