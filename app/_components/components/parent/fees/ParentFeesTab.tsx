"use client";

import { AlertCircle } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import ParentTimellyLoader from "../ParentTimellyLoader";
import FeePaymentReceiptTemplate from "../../pdf/FeePaymentReceiptTemplate";
import { useParentFeesState } from "./shared";
import { FeeSummarySection } from "./shared";
import { DueHeadsSection } from "./shared";
import { PaymentHistorySection } from "./shared";

export default function ParentFeesTab() {
  const {
    fee,
    loading,
    error,
    generatingPdfId,
    receiptData,
    receiptRef,
    dueHeadRows,
    transactions,
    handleDownloadInvoice,
  } = useParentFeesState();

  if (loading && !fee) {
    return (
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 sm:gap-6 px-2 sm:px-4 pb-6">
        <PageHeader title="Fees" subtitle="View fee dues and payment history" />
        <div className="flex-1 flex items-center justify-center min-h-[40vh]">
          <ParentTimellyLoader preset="fees" className="w-full max-w-2xl" />
        </div>
      </div>
    );
  }

  if (error || !fee) {
    return (
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 sm:gap-6 px-2 sm:px-4 pb-6">
        <PageHeader title="Fees" subtitle="View fee dues and payment history" />
        <div className="glass-card rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center gap-4 text-center">
          <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-amber-400" />
          <p className="text-white font-medium text-sm sm:text-base">
            {error || "Fee details not configured. Please contact the school admin."}
          </p>
        </div>
      </div>
    );
  }

  const progress = fee.finalFee > 0 ? Math.min((fee.amountPaid / fee.finalFee) * 100, 100) : 0;
  const totalDue = dueHeadRows.reduce((s, h) => s + h.due, 0);

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 sm:gap-6 px-2 sm:px-4 pb-6">
      <PageHeader title="Fees" subtitle="View all fee dues and payment history" compact />

      <FeeSummarySection fee={fee} progress={progress} />

      <DueHeadsSection dueHeadRows={dueHeadRows} totalDue={totalDue} />

      <PaymentHistorySection
        transactions={transactions}
        generatingPdfId={generatingPdfId}
        onDownloadInvoice={handleDownloadInvoice}
      />

      <FeePaymentReceiptTemplate
        ref={receiptRef}
        data={receiptData}
        singleCopy
        showSignature={false}
      />
    </div>
  );
}
