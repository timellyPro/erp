"use client";
import SelectInput from "../../common/SelectInput";
import PrimaryButton from "../../common/PrimaryButton";
import SecondaryButton from "../../common/SecondaryButton";
import type { Class, ExtraFee, FeeStructure, Student } from "./types";
import { useOfflinePaymentFormState, type SelectedHead, OfflinePaymentFeeHeadsList, OfflinePaymentAmountPreview } from "./shared/offline-payment";

interface OfflinePaymentFormProps {
  classes: Class[];
  structures: FeeStructure[];
  extraFees: ExtraFee[];
  students: Student[];
  onSuccess: () => void;
}

export default function OfflinePaymentForm({
  classes,
  structures,
  extraFees,
  students,
  onSuccess,
}: OfflinePaymentFormProps) {
  const {
    showForm,
    setShowForm,
    selectedClassId,
    setSelectedClassId,
    selectedSection,
    setSelectedSection,
    studentId,
    setStudentId,
    amount,
    setAmount,
    selectedHeads,
    setSelectedHeads,
    paymentMode,
    setPaymentMode,
    refNo,
    setRefNo,
    saving,
    breakdownLoading,
    breakdownError,
    remainingFee,
    handleSubmit,
    sectionOptions,
    filteredStudents,
    headOptions,
    toggleHead,
    dueByKey,
    numericAmount,
    preview,
    resetForm,
  } = useOfflinePaymentFormState({ structures, extraFees, students, onSuccess });

  const getHeadKey = (head: SelectedHead) =>
    head.headType === "BASE_COMPONENT" ? `BASE:${head.componentIndex}` : `EXTRA:${head.extraFeeId}`;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold mb-4">Offline Payment Entry</h3>
      <p className="text-sm text-gray-400 mb-4">
        Record manual payments, cheque deposits, or bank transfers.
      </p>
      {!showForm ? (
        <SecondaryButton title="Record Offline Payment" onClick={() => setShowForm(true)} />
      ) : (
        <div className="space-y-4">
          <SelectInput
            label="Class"
            value={selectedClassId}
            onChange={(v) => {
              setSelectedClassId(v);
              setSelectedSection("");
              setStudentId("");
              setSelectedHeads([]);
            }}
            options={[
              { label: "Select class", value: "" },
              ...classes.map((c) => ({
                label: `${c.name}${c.section ? `-${c.section}` : ""}`,
                value: c.id,
              })),
            ]}
          />
          <SelectInput
            label="Section"
            value={selectedSection}
            onChange={(v) => {
              setSelectedSection(v);
              setStudentId("");
              setSelectedHeads([]);
            }}
            disabled={!selectedClassId}
            options={[
              { label: "All Sections", value: "" },
              ...sectionOptions.map((sec) => ({ label: sec, value: sec })),
            ]}
          />
          <SelectInput
            label="Student"
            value={studentId}
            onChange={(v) => {
              setStudentId(v);
              setSelectedHeads([]);
            }}
            options={[
              { label: "Select student", value: "" },
              ...filteredStudents.map((s) => ({
                label: `${s.user.name || s.admissionNumber} (${s.class?.section || "-"})`,
                value: s.id,
              })),
            ]}
          />
          <OfflinePaymentFeeHeadsList
            headOptions={headOptions}
            selectedHeads={selectedHeads}
            dueByKey={dueByKey}
            studentId={studentId}
            getHeadKey={getHeadKey}
            onToggleHead={toggleHead}
          />
          {breakdownLoading ? (
            <p className="text-xs text-gray-500">Loading due amounts...</p>
          ) : breakdownError ? (
            <p className="text-xs text-red-400">{breakdownError}</p>
          ) : null}
          <OfflinePaymentAmountPreview
            amount={amount}
            setAmount={setAmount}
            numericAmount={numericAmount}
            remainingFee={remainingFee}
            preview={preview}
            headOptions={headOptions}
          />
          <div className="flex flex-wrap gap-2">
            {["Cash", "Cheque", "UPI", "Bank"].map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMode(m)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  paymentMode === m ? "bg-emerald-500/30 text-emerald-400" : "bg-white/5"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Reference No. / UTR No.</label>
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white"
              placeholder="Enter reference / UTR / cheque number"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <PrimaryButton
              title={saving ? "Saving..." : "Generate Receipt & Save"}
              loading={saving}
              onClick={handleSubmit}
            />
            <button
              onClick={resetForm}
              className="rounded-xl border border-white/20 px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
