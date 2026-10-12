"use client";

import PageHeader from "../../common/PageHeader";
import PageTabs from "../../schooladmin/schooladmincomponents/PageHeaderTabs";
import AdmissionReceiptTemplate from "../../pdf/AdmissionReceiptTemplate";
import { DeleteAdmissionDialog } from "./shared";
import { AdmissionPaymentDialog } from "./shared";
import { AdmissionFeeAssignDialog } from "./shared";
import { AdmissionFormView } from "./shared";
import { AdmissionListView } from "./shared";
import { useAdmissionTabState } from "./shared";

export default function TeacherAdmissionTab() {
  const {
    router,
    view,
    editId,
    form,
    setForm,
    submitting,
    message,
    messageTone,
    classes,
    classOptions,
    onClassIdChange,
    handleSaveClick,
    search,
    setSearch,
    filters,
    setFilters,
    showExportMenu,
    setShowExportMenu,
    exportAdmissions,
    listPhase,
    setListPhase,
    setPage,
    tableColumns,
    rows,
    loading,
    page,
    totalPages,
    paidApplicationsCount,
    goToStudentDetails,
    workflowBusyId,
    enrollFromRow,
    openPaymentDialog,
    setDeleteRow,
    deleteRow,
    deleting,
    confirmDelete,
    paymentDialog,
    setPaymentDialog,
    paymentForm,
    setPaymentForm,
    paymentError,
    paying,
    markFeePaid,
    printFeeReceipt,
    receiptData,
    receiptRef,
    feeAssign,
  } = useAdmissionTabState();

  return (
    <>
      <PageHeader
        title="Admission"
        subtitle={
          view === "all"
            ? "This list is admission applications only. The enrolled student roster is under the Students tab."
            : "Track applications as Pending → Upcoming, then approve to create the school student automatically."
        }
        rightSlot={
          <PageTabs
            tabs={[
              { label: "New Application", value: "add" },
              { label: `Applications (${paidApplicationsCount})`, value: "all" },
            ]}
            queryKey="view"
          />
        }
      />

      <div className="w-full min-w-0 max-w-full space-y-6">
        {view === "add" && (
          <AdmissionFormView
            editId={editId}
            onCancelEdit={() => router.push("?tab=admission&view=all")}
            form={form}
            onFormChange={setForm}
            classes={classes}
            classOptions={classOptions}
            onClassIdChange={onClassIdChange}
            handleSaveClick={handleSaveClick}
            submitting={submitting}
            message={message}
            messageTone={messageTone}
          />
        )}

        {view === "all" && (
          <AdmissionListView
            message={message}
            messageTone={messageTone}
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            onFiltersChange={setFilters}
            classes={classes}
            showExportMenu={showExportMenu}
            onToggleExportMenu={() => setShowExportMenu((v) => !v)}
            onExport={(format) => {
              setShowExportMenu(false);
              exportAdmissions(format);
            }}
            listPhase={listPhase}
            onListPhaseChange={(phase) => {
              setListPhase(phase);
              setPage(1);
            }}
            tableColumns={tableColumns}
            rows={rows}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            goToStudentDetails={goToStudentDetails}
            workflowBusyId={workflowBusyId}
            onEnroll={enrollFromRow}
            onWarmAssignCatalog={feeAssign.warmAssignCatalog}
            onOpenAssignFeesDialog={feeAssign.openAssignFeesDialog}
            onOpenPaymentDialog={openPaymentDialog}
            onPrintFeeReceipt={printFeeReceipt}
            onEditRow={(row) => router.push(`?tab=admission&view=add&editId=${row.id}`)}
            onDeleteRow={setDeleteRow}
          />
        )}
      </div>

      <AdmissionPaymentDialog
        dialog={paymentDialog}
        paymentForm={paymentForm}
        onPaymentFormChange={setPaymentForm}
        paymentError={paymentError}
        paying={paying}
        onCancel={() => setPaymentDialog(null)}
        onPay={markFeePaid}
      />

      <AdmissionFeeAssignDialog
        dialog={feeAssign.feeAssignDialog}
        classBaseFeeTotal={feeAssign.classBaseFeeTotal}
        existingStudentExtras={feeAssign.existingStudentExtras}
        editingExistingFeeId={feeAssign.editingExistingFeeId}
        editingExistingFeeName={feeAssign.editingExistingFeeName}
        editingExistingFeeAmount={feeAssign.editingExistingFeeAmount}
        editingExistingFeeSplit={feeAssign.editingExistingFeeSplit}
        onStartEditExisting={feeAssign.startEditExistingFee}
        onCancelEditExisting={feeAssign.cancelEditExistingFee}
        onEditingNameChange={feeAssign.setEditingExistingFeeName}
        onEditingAmountChange={feeAssign.setEditingExistingFeeAmount}
        onEditingSplitChange={feeAssign.setEditingExistingFeeSplit}
        onSaveExisting={feeAssign.updateExistingStudentFee}
        onDeleteExisting={feeAssign.deleteExistingStudentFee}
        catalogLoading={feeAssign.catalogLoading}
        dbFeeHeadOptions={feeAssign.dbFeeHeadOptions}
        onToggleDbFeeHeadOption={feeAssign.toggleDbFeeHeadOption}
        onAddSelectedDbHeads={feeAssign.addSelectedDbHeadsToRows}
        assignFeeError={feeAssign.assignFeeError}
        feeAssignRows={feeAssign.feeAssignRows}
        onFeeAssignRowChange={feeAssign.patchFeeAssignRow}
        onRemoveFeeAssignRow={feeAssign.removeFeeAssignRow}
        onAddFeeAssignRow={feeAssign.addAssignFeeRow}
        assigningFees={feeAssign.assigningFees}
        onCancel={() => feeAssign.setFeeAssignDialog(null)}
        onSave={feeAssign.saveAssignedFees}
      />

      <DeleteAdmissionDialog
        row={deleteRow}
        deleting={deleting}
        onCancel={() => setDeleteRow(null)}
        onConfirm={confirmDelete}
      />
      <div className="pointer-events-none opacity-0 fixed -top-[10000px] -left-[10000px]">
        <AdmissionReceiptTemplate ref={receiptRef} data={receiptData} />
      </div>
    </>
  );
}
