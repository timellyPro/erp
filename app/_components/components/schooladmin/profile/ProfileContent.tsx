"use client";

import { Suspense } from "react";
import { AcademicPerformance } from "./components/AcademicPerformance";
import { FeeTransactions } from "./components/FeeTransactions";
import { FeesBreakdown } from "./components/FeesBreakdown";
import { ProfileSidebar } from "./components/ProfileSidebar";
import { AttendanceTrends } from "./components/AttendanceTrends";
import { Certificates } from "./components/Certificates";
import { getFeeBreakdownCached } from "@/lib/fees/feeBreakdownClientCache";
import { FileSpreadsheet } from "lucide-react";
import BulkExtraFeeByTimellyModal from "./components/BulkExtraFeeByTimellyModal";
import PageHeader from "../../common/PageHeader";
import Spinner from "../../common/Spinner";
import { StudentNameCard } from "./shared";
import { StudentFeesPaymentModal } from "./shared";
import { StudentSearchFilterBar } from "./shared";
import { ProfileStatCards } from "./shared";
import { useStudentDetailsPageState } from "./shared";

function StudentDetailsPageContent() {
  const {
    students,
    selectedId,
    detail,
    feeBreakdown,
    feeBreakdownPending,
    transactionsReady,
    listLoading,
    searchQuery,
    setSearchQuery,
    filterClass,
    setFilterClass,
    filterSection,
    setFilterSection,
    filterStatus,
    setFilterStatus,
    classes,
    bulkExtraFeeOpen,
    setBulkExtraFeeOpen,
    feesModalOpen,
    setFeesModalOpen,
    autoPrintPaymentId,
    setAutoPrintPaymentId,
    sidebarAsideRef,
    showStickyStudentName,
    selectStudent,
    changeSelectedId,
    warmFeeBreakdown,
    refreshFeesForStudent,
    removePaymentForStudent,
    setReloadKey,
    studentSelectOptions,
    isSelectedInactive,
    pageStudentName,
    pageStudentMeta,
    classOptions,
    statusOptions,
    sectionOptions,
    handleSidebarSaved,
  } = useStudentDetailsPageState();

  return (
    <div className="w-full min-w-0 space-y-4 pb-6 sm:space-y-6 sm:pb-8 md:space-y-8">
      <PageHeader
        compact
        title="Student Details"
        subtitle="Search, view records, and manage fees."
        rightSlot={
          <div className="w-full sm:w-auto flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setBulkExtraFeeOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/15 px-3 py-2 text-xs sm:text-sm font-semibold text-lime-200 hover:bg-lime-500/25 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              Bulk extra fees (Excel)
            </button>
            <div className="bg-[#0F172A]/40 border border-white/10 px-3 py-2 sm:px-4 rounded-xl text-xs sm:text-sm text-gray-200 whitespace-nowrap text-center">
              {new Date().getFullYear() - 1}-{new Date().getFullYear() + 1}
            </div>
          </div>
        }
      />
      <BulkExtraFeeByTimellyModal
        open={bulkExtraFeeOpen}
        onClose={() => setBulkExtraFeeOpen(false)}
        onApplied={() => setReloadKey((k) => k + 1)}
      />
      <StudentSearchFilterBar
        students={students}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectStudent={selectStudent}
        selectedId={selectedId}
        onSelectedIdChange={changeSelectedId}
        filterClass={filterClass}
        onFilterClassChange={setFilterClass}
        filterSection={filterSection}
        onFilterSectionChange={setFilterSection}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        statusOptions={statusOptions}
        classOptions={classOptions}
        sectionOptions={sectionOptions}
        studentSelectOptions={studentSelectOptions}
      />

      {listLoading && students.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">Loading student list…</div>
      )}

      {detail && (
        <>
          {showStickyStudentName && pageStudentName ? (
            <div className="pointer-events-none fixed top-[5.75rem] left-[calc(16rem+1.25rem)] z-30 hidden w-[200px] xl:block">
              <StudentNameCard
                name={pageStudentName}
                meta={pageStudentMeta}
                className="pointer-events-auto border-white/15 bg-[#0a0f1a]/70 shadow-lg backdrop-blur-md"
              />
            </div>
          ) : null}

          {showStickyStudentName && pageStudentName ? (
            <div className="xl:hidden sticky top-0 z-30 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-2 mb-2 bg-[#070b14]/95 backdrop-blur-md border-b border-white/10">
              <StudentNameCard name={pageStudentName} meta={pageStudentMeta} className="bg-transparent border-0 px-0 py-0" />
            </div>
          ) : null}

        <div className="min-w-0 w-full">
          {isSelectedInactive ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <span className="font-semibold text-red-100">Inactive student.</span>{" "}
              This student is inactive — you cannot record new fees, mark attendance, or use the student portal until they are set back to Active. Existing payments and transaction history are unchanged.
            </div>
          ) : null}

          <div className="flex flex-col xl:flex-row xl:flex-wrap gap-4 sm:gap-6 md:gap-8 min-w-0 w-full items-start">
            <aside
              ref={sidebarAsideRef}
              className="relative z-10 w-full min-w-0 shrink-0 self-start xl:w-[280px] 2xl:w-[300px]"
            >
            <ProfileSidebar
              studentId={detail.student.id}
              feesRecordingDisabled={isSelectedInactive}
              student={{
                name: detail.student.name,
                id: detail.student.admissionNumber,
                className: detail.student.class?.displayName ?? "-",
                rollNo: detail.student.rollNo,
                age: String(detail.student.age ?? "-"),
                dob: detail.student.dob || "",
                email: detail.student.email,
                phone: detail.student.phone,
                address: detail.student.address || "—",
                photoUrl: detail.student.photoUrl ?? undefined,
              }}
              fatherName={detail.student.fatherName}
              fatherPhone={detail.student.fatherPhone}
              motherName={detail.student.motherName}
              motherPhone={detail.student.motherPhone}
              classId={detail.student.class?.id ?? null}
              classes={classes.map((c) => ({
                id: c.id,
                label: `${c.name}${c.section ? ` - ${c.section}` : ""}`,
              }))}
              gender={detail.student.gender ?? ""}
              residencyType={detail.student.residencyType ?? "Day Scholar"}
              onSaved={handleSidebarSaved}
              onOpenFees={() => {
                if (isSelectedInactive) return;
                warmFeeBreakdown();
                setFeesModalOpen(true);
              }}
              onFeesHover={warmFeeBreakdown}
            />
            </aside>

            <div className="flex-1 min-w-0 w-full xl:basis-[calc(100%-300px-2rem)] 2xl:basis-[calc(100%-320px-2rem)] space-y-4 sm:space-y-6 md:space-y-8">
            <ProfileStatCards detail={detail} feeBreakdown={feeBreakdown} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
              <AcademicPerformance data={detail.academicPerformance} />
              <AttendanceTrends data={detail.attendanceTrends} />
            </div>
            </div>

            <div className="relative z-0 min-w-0 w-full basis-full space-y-4 sm:space-y-6 md:space-y-8">
            {detail.fee ? (
              <FeesBreakdown
                key={`fees-${detail.student.id}`}
                studentId={detail.student.id}
                classId={detail.student.class?.id ?? null}
                feesRecordingDisabled={isSelectedInactive}
                totalFee={feeBreakdown?.totalAmount ?? detail.fee.totalFee}
                baseTotalFee={
                  feeBreakdown?.dueHeads?.length
                    ? Math.round(
                        feeBreakdown.dueHeads.reduce((s, h) => s + (Number(h.grossAmount) || 0), 0)
                      )
                    : detail.fee.baseTotalFee
                }
                discountPercent={detail.fee.discountPercent}
                amountPaid={feeBreakdown?.amountPaid ?? detail.fee.amountPaid}
                remainingFee={feeBreakdown?.remainingFee ?? detail.fee.remainingFee}
                payments={detail.payments}
                studentName={detail.student.name}
                admissionNumber={detail.student.admissionNumber}
                classDisplayName={detail.student.class?.displayName ?? "-"}
                classSection={detail.student.class?.section ?? null}
                schoolName={detail.student.schoolName}
                discountFeeHeadKey={detail.fee.discountFeeHeadKey}
                discountFeeHeadLabel={detail.fee.discountFeeHeadLabel}
                discountRemarks={detail.fee.discountRemarks}
                discountFixedAmount={detail.fee.discountFixedAmount}
                latestDiscountApproval={detail.fee.discountApprovals?.[0] ?? null}
                discountApprovals={detail.fee.discountApprovals ?? []}
                onFeeModified={(paymentResult) => {
                  if (paymentResult?.payment.id) setAutoPrintPaymentId(paymentResult.payment.id);
                  if (detail.student.id) void refreshFeesForStudent(detail.student.id, paymentResult);
                }}
                residencyType={detail.student.residencyType ?? null}
                initialFeeBreakdown={feeBreakdown}
                feeBreakdownPending={feeBreakdownPending}
              />
            ) : null}

            <FeeTransactions
              key={`txns-${detail.student.id}`}
              fee={detail.fee}
              feeBreakdown={feeBreakdown}
              payments={detail.payments}
              transactionsLoading={!transactionsReady}
              applicationFee={detail.student.applicationFee}
              admissionFee={detail.student.admissionFee}
              studentCreatedAt={detail.student.createdAt}
              studentName={detail.student.name}
              studentId={detail.student.id}
              admissionNumber={detail.student.admissionNumber}
              classDisplayName={detail.student.class?.displayName ?? "-"}
              residencyType={detail.student.residencyType ?? "Day Scholar"}
              parentName={detail.student.fatherName?.trim() || "-"}
              motherName={detail.student.motherName?.trim() || "-"}
              parentPhone={
                detail.student.fatherPhone?.trim() ||
                detail.student.phone?.trim() ||
                "-"
              }
              feesRecordingDisabled={isSelectedInactive}
              autoPrintPaymentId={autoPrintPaymentId}
              onAutoPrintDone={() => setAutoPrintPaymentId(null)}
              onPaymentsChanged={() => {
                if (detail.student.id) void refreshFeesForStudent(detail.student.id);
              }}
              onPaymentDeleted={(result) => {
                if (detail.student.id) removePaymentForStudent(detail.student.id, result);
              }}
            />

            <Certificates certificates={detail.certificates} />
            </div>
          </div>
        </div>
        </>
      )}

      {!detail && selectedId && !listLoading && (
        <div className="text-center py-12 text-gray-400">Student not found.</div>
      )}

      {feesModalOpen && detail && !isSelectedInactive ? (
        <StudentFeesPaymentModal
          studentId={detail.student.id}
          studentName={detail.student.name}
          initialFeeBreakdown={feeBreakdown ?? getFeeBreakdownCached(detail.student.id)}
          breakdownPending={feeBreakdownPending}
          onClose={() => setFeesModalOpen(false)}
          onSuccess={(result) => {
            setFeesModalOpen(false);
            if (result.payment.id) setAutoPrintPaymentId(result.payment.id);
            void refreshFeesForStudent(detail.student.id, result);
          }}
          onPaymentFailed={(message) => {
            alert(message);
            void refreshFeesForStudent(detail.student.id);
          }}
        />
      ) : null}

      {!detail && !selectedId && !listLoading && students.length === 0 && (
        <div className="text-center py-12 text-gray-400">No students found.</div>
      )}
    </div>
  );
}

export default function StudentDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-white/70">
          <Spinner />
        </div>
      }
    >
      <StudentDetailsPageContent />
    </Suspense>
  );
}
