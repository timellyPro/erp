"use client";

import { ArrowRightLeft, Plus } from "lucide-react";
import SearchInput from "../../common/SearchInput";
import SelectInput from "../../common/SelectInput";
import SuccessPopups from "../../common/SuccessPopUps";
import { useAssignSectionState, NEW_SECTION_VALUE } from "./shared";
import { StudentAssignPanel } from "./shared";

interface AssignSectionPanelProps {
  onCancel: () => void;
  onSuccess?: () => void;
}

export default function AssignSectionPanel({
  onCancel,
  onSuccess,
}: AssignSectionPanelProps) {
  const {
    selectedClassName,
    setSelectedClassName,
    selectedStudentIds,
    studentSearch,
    setStudentSearch,
    targetSection,
    setTargetSection,
    newSectionName,
    setNewSectionName,
    isLoadingClasses,
    isLoadingStudents,
    isSaving,
    showSuccess,
    setShowSuccess,
    successMessage,
    error,
    classNameOptions,
    sectionOptions,
    resolvedTargetSectionName,
    filteredStudents,
    allVisibleSelected,
    someVisibleSelected,
    toggleStudent,
    toggleAllVisible,
    clearSelection,
    selectionFilteredBySearch,
    canAssign,
    handleAssign,
  } = useAssignSectionState();

  return (
    <div className="bg-[#0F172A]/50 rounded-2xl p-6 border border-white/10 animate-fadeIn shadow-inner space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 text-white font-semibold">
          <ArrowRightLeft size={18} className="text-lime-400" />
          Assign Section
        </div>
        <p className="text-xs text-white/50">
          1. Select class → 2. Pick section → 3. Check students → 4. Assign
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <SelectInput
          label="Select Class"
          value={selectedClassName}
          onChange={setSelectedClassName}
          options={
            classNameOptions.length > 1
              ? classNameOptions
              : [
                  {
                    label: isLoadingClasses ? "Loading..." : "No classes found",
                    value: "",
                    disabled: true,
                  },
                ]
          }
        />

        <SelectInput
          label="Assign to Section"
          value={targetSection}
          onChange={(value) => {
            setTargetSection(value);
            if (value !== NEW_SECTION_VALUE) setNewSectionName("");
          }}
          options={sectionOptions}
          disabled={!selectedClassName}
        />

        {targetSection === NEW_SECTION_VALUE && (
          <SearchInput
            label="New Section Name"
            placeholder="e.g. C"
            showSearchIcon={false}
            value={newSectionName}
            onChange={setNewSectionName}
          />
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {selectedClassName && (
        <StudentAssignPanel
          selectedClassName={selectedClassName}
          filteredStudents={filteredStudents}
          selectedStudentIds={selectedStudentIds}
          selectionFilteredBySearch={selectionFilteredBySearch}
          clearSelection={clearSelection}
          studentSearch={studentSearch}
          onStudentSearchChange={setStudentSearch}
          isLoadingStudents={isLoadingStudents}
          allVisibleSelected={allVisibleSelected}
          someVisibleSelected={someVisibleSelected}
          toggleAllVisible={toggleAllVisible}
          toggleStudent={toggleStudent}
          resolvedTargetSectionName={resolvedTargetSectionName}
          canAssign={canAssign}
          isSaving={isSaving}
          onAssign={() => void handleAssign()}
        />
      )}

      {!selectedClassName && (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/2 px-4 py-8 text-center text-sm text-white/50">
          <Plus size={20} className="mx-auto mb-2 text-white/30" />
          Select a class to view students and assign sections.
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 cursor-pointer"
        >
          Close
        </button>
      </div>

      <SuccessPopups
        open={showSuccess}
        title={successMessage || "Section assigned successfully"}
        onClose={() => {
          setShowSuccess(false);
          onSuccess?.();
        }}
      />
    </div>
  );
}
