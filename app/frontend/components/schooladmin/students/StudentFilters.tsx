"use client";

import { Download, Plus, Search, Upload, X } from "lucide-react";
import SearchInput from "../../common/SearchInput";
import SelectInput from "../../common/SelectInput";
import { SelectOption } from "./types";

type Props = {
  classOptions: SelectOption[];
  sectionOptions: SelectOption[];
  selectedClass: string;
  onClassChange: (value: string) => void;
  selectedSection: string;
  onSectionChange: (value: string) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  showAddForm: boolean;
  onToggleAddForm: () => void;
  onToggleUpload: () => void;
  onDownloadReport: () => void;
};

export default function StudentFilters({
  classOptions,
  sectionOptions,
  selectedClass,
  onClassChange,
  selectedSection,
  onSectionChange,
  searchQuery,
  onSearchChange,
  showAddForm,
  onToggleAddForm,
  onToggleUpload,
  onDownloadReport,
}: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.1fr_1.1fr_1.4fr_auto] gap-3 items-end">
        <SelectInput
          label="Class"
          value={selectedClass}
          onChange={onClassChange}
          options={classOptions}
          bgColor="white"
        />

        <SelectInput
          label="Section"
          value={selectedSection}
          onChange={onSectionChange}
          options={sectionOptions}
          bgColor="white"
        />

        <SearchInput
          label="Search"
          placeholder="Search students..."
          value={searchQuery}
          onChange={onSearchChange}
          icon={Search}
          variant="glass"
          className="w-full md:col-span-2 lg:col-span-1"
        />

        <button
          type="button"
          onClick={onToggleAddForm}
          className="w-full lg:w-auto md:col-span-2 lg:col-span-1 px-3 md:px-4 py-2 border rounded-xl font-medium 
          transition-all shadow-[0_0_15px_rgba(163,230,53,0.15)] text-xs md:text-sm flex items-center justify-center
           gap-2 bg-lime-400/10 text-lime-400 border-lime-400/20 hover:bg-lime-400/20"
        >
          {showAddForm ? (
            <>
              <X size={16} /> Close Form
            </>
          ) : (
            <>
              <Plus size={16} /> Add Student
            </>
          )}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onToggleUpload}
          className="px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium
           transition-all text-xs md:text-sm flex items-center gap-2 text-gray-300"
        >
          <Upload size={16} /> Upload CSV
        </button>
        {/* <button
          onClick={onDownloadReport}
          className="px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium
           transition-all text-xs md:text-sm flex items-center gap-2 text-gray-300"
        >
          <Download size={16} /> Download Report
        </button> */}
      </div>
    </div>
  );
}
