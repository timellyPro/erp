"use client";

import { Zap, Settings, PlusCircle, AlertCircle } from "lucide-react";
import { ModifyFeeModal, type FeeModifyResult } from "./ModifyFeeModal";
import { AddExtraFeeModal } from "./AddExtraFeeModal";
import { AssignFeeHeadsCatalogModal } from "./AssignFeeHeadsCatalogModal";
import { EditExtraFeeModal } from "./EditExtraFeeModal";
import {
  mergeDiscountApprovals,
  type FeesBreakdownProps as Props,
} from "./shared";
import { FeeReceiptPrintLayout } from "./shared";
import { FeeSummaryCards } from "./shared";
import { FeeHeadCardsGrid } from "./shared";
import { FeePaymentProgressSection } from "./shared";
import { EditBaseFeeHeadDialog } from "./shared";
import { RecordHeadPaymentDialog } from "./shared";
import { useFeesBreakdownState } from "./shared";

export const FeesBreakdown = (props: Props) => {
  const {
    studentId,
    classId = null,
    totalFee,
    discountPercent,
    studentName,
    admissionNumber,
    classDisplayName,
    schoolName,
    payments = [],
    discountFeeHeadKey,
    discountFeeHeadLabel,
    discountRemarks,
    discountFixedAmount,
    onFeeModified,
    residencyType,
    classSection = null,
    feesRecordingDisabled = false,
  } = props;

  const {
    receiptRef,
    showModifyFee,
    setShowModifyFee,
    modifyFeeOpening,
    showAddExtraFee,
    setShowAddExtraFee,
    showAssignFeeHeadsCatalog,
    setShowAssignFeeHeadsCatalog,
    editExtra,
    setEditExtra,
    headsLoading,
    deletingExtraId,
    baseHeadBusyKey,
    editBaseHead,
    setEditBaseHead,
    editBaseError,
    baseStructureMutating,
    feeHeadOptionsForDiscount,
    headCards,
    payingHead,
    setPayingHead,
    paymentForm,
    setPaymentForm,
    paymentSaving,
    paymentError,
    approvalState,
    setApprovalState,
    feeBreakdown,
    paymentProgressRows,
    breakdownNetTotal,
    displayPreDiscountTotal,
    displayTotalAmount,
    discountAmount,
    raisedDiscountAmount,
    approvalUi,
    displayAmountPaid,
    displayRemainingAmount,
    paidPercentage,
    cardTotalAmount,
    cardAmountPaid,
    cardRemainingAmount,
    cardPaidPercentage,
    residencyAdjustmentNote,
    previousYearRemainingAmount,
    openModifyFeeModal,
    openHeadPaymentModal,
    editExtraFeeHead,
    deleteExtraFeeHead,
    editBaseFeeHead,
    deleteBaseFeeHead,
    handleSaveEditBaseHead,
    submitHeadPayment,
  } = useFeesBreakdownState(props);

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-3 sm:p-6 min-w-0">
      {feesRecordingDisabled ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold text-red-100">Inactive student.</span> You cannot record fees for this student.
          </span>
        </div>
      ) : null}
      {residencyAdjustmentNote ? (
        <div className="mb-4 rounded-xl border border-lime-500/30 bg-lime-500/10 px-3 py-2.5 text-sm text-lime-100">
          {residencyAdjustmentNote}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 min-w-0">
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2 min-w-0">
          <Zap className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="leading-tight">Fees Breakdown</span>
        </h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => !feesRecordingDisabled && setShowAssignFeeHeadsCatalog(true)}
            disabled={feesRecordingDisabled}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-100 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusCircle className="w-4 h-4 flex-shrink-0" />
            Assign from catalog
          </button>
          <button
            type="button"
            onClick={() => !feesRecordingDisabled && setShowAddExtraFee(true)}
            disabled={feesRecordingDisabled}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusCircle className="w-4 h-4 flex-shrink-0" />
            Add Extra Fee
          </button>
          <button
            type="button"
            onClick={() => void openModifyFeeModal()}
            disabled={feesRecordingDisabled || modifyFeeOpening}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {modifyFeeOpening ? "Refreshing..." : "Edit Fee Setup"}
          </button>
          {/* {payments.length > 0 && (
            <button
              onClick={handleDownloadReceipt}
              disabled={isGeneratingReceipt}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              {isGeneratingReceipt ? "Generating..." : "Download Receipt"}
            </button>
          )} */}
        </div>
      </div>

      <FeeSummaryCards
        displayTotalAmount={cardTotalAmount}
        displayPreDiscountTotal={displayPreDiscountTotal}
        raisedDiscountAmount={raisedDiscountAmount}
        discountAmount={discountAmount}
        approvalUi={approvalUi}
        approvalState={approvalState}
        discountFeeHeadLabel={discountFeeHeadLabel}
        discountFeeHeadKey={discountFeeHeadKey}
        discountRemarks={discountRemarks}
        displayAmountPaid={cardAmountPaid}
        paidPercentage={cardPaidPercentage}
        displayRemainingAmount={cardRemainingAmount}
        previousYearRemainingAmount={previousYearRemainingAmount}
      />

      <FeeHeadCardsGrid
        headCards={headCards}
        headsLoading={headsLoading}
        classId={classId}
        deletingExtraId={deletingExtraId}
        baseHeadBusyKey={baseHeadBusyKey}
        baseStructureMutating={baseStructureMutating}
        feesRecordingDisabled={feesRecordingDisabled}
        onEditExtra={editExtraFeeHead}
        onDeleteExtra={deleteExtraFeeHead}
        onEditBase={editBaseFeeHead}
        onDeleteBase={deleteBaseFeeHead}
        onRecordPayment={openHeadPaymentModal}
      />

      {/* Payment Progress Bar */}
      <FeePaymentProgressSection
        paidPercentage={paidPercentage}
        headsLoading={headsLoading}
        paymentProgressRows={paymentProgressRows}
        feeBreakdown={feeBreakdown}
      />

      {/* Hidden Receipt Section for PDF */}
      <FeeReceiptPrintLayout
        contentRef={receiptRef}
        schoolName={schoolName}
        studentName={studentName}
        admissionNumber={admissionNumber}
        classDisplayName={classDisplayName}
        totalFee={totalFee}
        amountPaid={displayAmountPaid}
        remainingAmount={displayRemainingAmount}
        paidPercentage={paidPercentage}
        payments={payments}
        feeBreakdown={feeBreakdown}
      />

      {showModifyFee && (
        <ModifyFeeModal
          studentId={studentId}
          currentTotalFee={breakdownNetTotal ?? displayTotalAmount}
          preDiscountTotal={displayPreDiscountTotal}
          currentDiscountPercent={discountPercent}
          feeHeadOptions={feeHeadOptionsForDiscount}
          initialDiscountFeeHeadKey={discountFeeHeadKey ?? null}
          initialDiscountFeeHeadLabel={discountFeeHeadLabel ?? null}
          initialDiscountRemarks={discountRemarks ?? null}
          initialDiscountFixedAmount={discountFixedAmount ?? null}
          onClose={() => setShowModifyFee(false)}
          onSuccess={(result?: FeeModifyResult) => {
            if (Array.isArray(result?.approvalRequests) && result.approvalRequests.length > 0) {
              setApprovalState((prev) => mergeDiscountApprovals(prev, result.approvalRequests ?? []));
            } else if (result?.approvalRequest) {
              setApprovalState((prev) =>
                mergeDiscountApprovals(prev, [
                  {
                  id: result.approvalRequest!.id,
                  status: result.approvalRequest!.status,
                  discountFixedAmount: result.approvalRequest!.discountFixedAmount ?? null,
                  discountFeeHeadLabel: result.approvalRequest!.discountFeeHeadLabel ?? null,
                  discountRemarks: result.approvalRequest!.discountRemarks ?? null,
                  createdAt: result.approvalRequest!.createdAt,
                  },
                ])
              );
            }
            setShowModifyFee(false);
            if (!result?.pendingApproval) {
              onFeeModified?.();
            }
          }}
        />
      )}

      {showAssignFeeHeadsCatalog && (
        <AssignFeeHeadsCatalogModal
          studentId={studentId}
          studentName={studentName ?? "Student"}
          classDisplayName={classDisplayName ?? "-"}
          classId={classId}
          classSection={classSection}
          residencyType={residencyType}
          onClose={() => setShowAssignFeeHeadsCatalog(false)}
          onSuccess={() => {
            setShowAssignFeeHeadsCatalog(false);
            onFeeModified?.();
          }}
        />
      )}

      {showAddExtraFee && (
        <AddExtraFeeModal
          studentId={studentId}
          onClose={() => setShowAddExtraFee(false)}
          onSuccess={() => {
            setShowAddExtraFee(false);
            onFeeModified?.();
          }}
        />
      )}

      <EditBaseFeeHeadDialog
        editBaseHead={editBaseHead}
        onEditBaseHeadChange={setEditBaseHead}
        editBaseError={editBaseError}
        baseStructureMutating={baseStructureMutating}
        onSubmit={handleSaveEditBaseHead}
        onCancel={() => setEditBaseHead(null)}
      />

      {editExtra && (
        <EditExtraFeeModal
          extraFeeId={editExtra.id}
          initialName={editExtra.name}
          initialAmount={editExtra.amount}
          initialSplitIntoTwoInstallments={editExtra.splitIntoTwoInstallments}
          onClose={() => setEditExtra(null)}
          onSuccess={() => {
            setEditExtra(null);
            onFeeModified?.();
          }}
        />
      )}

      <RecordHeadPaymentDialog
        payingHead={payingHead}
        paymentForm={paymentForm}
        onPaymentFormChange={setPaymentForm}
        paymentError={paymentError}
        paymentSaving={paymentSaving}
        onCancel={() => setPayingHead(null)}
        onSubmit={submitHeadPayment}
      />
    </div>
  );
};
