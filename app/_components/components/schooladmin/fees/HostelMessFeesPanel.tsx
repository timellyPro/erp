"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import PrimaryButton from "../../common/PrimaryButton";
import type { Class, ExtraFee } from "./types";
import { classLabel, patchTargetId, scopeLabel, useHostelMessFeesState, SingleClassMessEditor, StatPill, DuplicateWarningBanner, HostelMessTableSection } from "./shared/hostel-mess";

const inputClass =
  "w-full min-h-[42px] rounded-xl border border-white/10 bg-[#0B1220]/80 px-4 py-2.5 text-sm text-gray-100 placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20";

const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-white/45 mb-1.5";

interface HostelMessFeesPanelProps {
  classes: Class[];
  extraFees: ExtraFee[];
  schoolResidencyHeadName: string;
  classHeadName: string;
  onSuccess: () => void;
}

export default function HostelMessFeesPanel(props: HostelMessFeesPanelProps) {
  const { classes, extraFees, schoolResidencyHeadName, classHeadName, onSuccess } = props;
  const {
    sortedClasses,
    duplicateIssues,
    duplicateRowCount,
    schoolHead,
    schoolAmount,
    setSchoolAmount,
    schoolSaving,
    saveSchoolHead,
    classAmounts,
    setClassAmounts,
    fillAllValue,
    setFillAllValue,
    classSearch,
    setClassSearch,
    tableSaving,
    tableProgress,
    cleanupBusy,
    showDuplicateList,
    setShowDuplicateList,
    classView,
    setClassView,
    applyFillAllToTable,
    runDuplicateCleanup,
    saveAllClassAmounts,
    filteredClasses,
    configuredCount,
    pendingChangeCount,
    classesWithDuplicate,
    schoolScopeMismatch,
    selectedClass,
    saveSingleClass,
    classViewSelectValue,
  } = useHostelMessFeesState({ classes, extraFees, schoolResidencyHeadName, classHeadName, onSuccess });

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent p-5 sm:p-6">
        <h3 className="text-lg font-semibold tracking-tight text-white">School & class fee catalog</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">
          Set hostel fee once for the whole school. Use the mess fee dropdown to edit one class or open
          the full table for all classes.
        </p>
      </header>

      <div className="max-w-md rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
        <h4 className="text-sm font-semibold text-amber-100">{schoolResidencyHeadName}</h4>
        <p className="mt-0.5 text-xs text-white/50">School-wide · hostellers only</p>
        {schoolScopeMismatch && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-black/20 px-3 py-2 text-xs text-amber-100">
            Not limited to hostellers yet ({scopeLabel(schoolHead.lump?.residencyScope)}).
          </p>
        )}
        <div className="mt-4">
          <label className={labelClass} htmlFor="school-residency-fee-amount">
            Combined amount (₹)
          </label>
          <input
            id="school-residency-fee-amount"
            type="number"
            value={schoolAmount}
            onChange={(e) => setSchoolAmount(e.target.value)}
            className={inputClass}
            placeholder="e.g. 50000"
          />
        </div>
        <div className="mt-4">
          <PrimaryButton
            title={schoolSaving ? "Saving…" : patchTargetId(schoolHead) ? "Update hostel fee" : "Save hostel fee"}
            loading={schoolSaving}
            onClick={saveSchoolHead}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.08] to-[#0B1220]/40 shadow-lg shadow-black/20">
        <div className="border-b border-white/10 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h4 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Sparkles className="h-5 w-5 text-sky-400" />
                {classHeadName} — all classes
              </h4>
              <p className="mt-1 text-sm text-white/55">
                Day scholars · combined total → 2 installments per class
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatPill label="Classes" value={String(sortedClasses.length)} />
              <StatPill label="Configured" value={`${configuredCount}`} tone="sky" />
              <StatPill
                label="To save"
                value={String(pendingChangeCount)}
                tone={pendingChangeCount > 0 ? "lime" : undefined}
              />
              <StatPill
                label="Duplicates"
                value={String(duplicateRowCount)}
                tone={duplicateRowCount > 0 ? "amber" : "ok"}
              />
            </div>
          </div>

          <DuplicateWarningBanner
            duplicateRowCount={duplicateRowCount}
            duplicateIssues={duplicateIssues}
            showDuplicateList={showDuplicateList}
            setShowDuplicateList={setShowDuplicateList}
            runDuplicateCleanup={runDuplicateCleanup}
            cleanupBusy={cleanupBusy}
            tableSaving={tableSaving}
          />

          <div className="mt-5 max-w-md">
            <label className={labelClass} htmlFor="mess-class-view">
              View classes
            </label>
            <div className="relative">
              <select
                id="mess-class-view"
                value={classViewSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setClassView(v === "" ? "closed" : v);
                  if (v !== "all") setClassSearch("");
                }}
                disabled={tableSaving || sortedClasses.length === 0}
                className={`${inputClass} appearance-none pr-10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <option value="">— Hidden —</option>
                <option value="all">All classes (table)</option>
                {sortedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)}
                    {classesWithDuplicate.has(c.id) ? " · duplicate" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            </div>
            <p className="mt-1.5 text-xs text-white/40">
              {classView === "closed"
                ? "Class list is hidden. Pick a class or open the full table."
                : classView === "all"
                  ? "Editing all classes in the table below."
                  : `Editing ${selectedClass ? classLabel(selectedClass) : "class"}.`}
            </p>
          </div>
        </div>

        {classView !== "closed" && (
        <div className="space-y-4 border-t border-white/10 px-5 py-4 sm:px-6">
          {classView === "all" && (
            <HostelMessTableSection
              classSearch={classSearch}
              setClassSearch={setClassSearch}
              fillAllValue={fillAllValue}
              setFillAllValue={setFillAllValue}
              applyFillAllToTable={applyFillAllToTable}
              tableSaving={tableSaving}
              sortedClasses={sortedClasses}
              filteredClasses={filteredClasses}
              classAmounts={classAmounts}
              setClassAmounts={setClassAmounts}
              classesWithDuplicate={classesWithDuplicate}
              extraFees={extraFees}
              classHeadName={classHeadName}
            />
          )}

          {selectedClass && classView !== "all" ? (
            <SingleClassMessEditor
              classRef={selectedClass}
              extraFees={extraFees}
              classHeadName={classHeadName}
              draft={classAmounts[selectedClass.id] ?? ""}
              hasDuplicate={classesWithDuplicate.has(selectedClass.id)}
              tableSaving={tableSaving}
              onDraftChange={(value) =>
                setClassAmounts((prev) => ({ ...prev, [selectedClass.id]: value }))
              }
              onSave={saveSingleClass}
            />
          ) : null}

          {tableProgress && (
            <p className="text-center text-xs text-white/50">{tableProgress}</p>
          )}

          {classView === "all" && (
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/45">
              Showing {filteredClasses.length} of {sortedClasses.length} classes · only changed rows
              are saved
            </p>
            <PrimaryButton
              title={
                tableSaving
                  ? "Saving…"
                  : pendingChangeCount > 0
                    ? `Save ${pendingChangeCount} class(es)`
                    : "Save all class mess fees"
              }
              loading={tableSaving}
              onClick={saveAllClassAmounts}
            />
          </div>
          )}
        </div>
        )}
      </div>
    </section>
  );
}
