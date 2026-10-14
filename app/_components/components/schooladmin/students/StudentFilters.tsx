"use client";

import { Download, FileText, Plus, Upload, X } from "lucide-react";
import SelectInput from "../../common/SelectInput";
import { SelectOption, StudentStatusFilter } from "./types";

const STATUS_TABS: { label: string; value: StudentStatusFilter }[] = [
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
  { label: "All", value: "All" },
];

type Props = {
  classOptions: SelectOption[];
  sectionOptions: SelectOption[];
  selectedClass: string;
  onClassChange: (value: string) => void;
  selectedSection: string;
  onSectionChange: (value: string) => void;
  statusFilter: StudentStatusFilter;
  onStatusFilterChange: (value: StudentStatusFilter) => void;
  showAddForm: boolean;
  onToggleAddForm: () => void;
  onToggleUpload: () => void;
  onDownloadExcel: () => void;
  onDownloadPdf: () => void;
  exportExcelLoading?: boolean;
  exportPdfLoading?: boolean;
};

export default function StudentFilters({
  classOptions,
  sectionOptions,
  selectedClass,
  onClassChange,
  selectedSection,
  onSectionChange,
  statusFilter,
  onStatusFilterChange,
  showAddForm,
  onToggleAddForm,
  onToggleUpload,
  onDownloadExcel,
  onDownloadPdf,
  exportExcelLoading = false,
  exportPdfLoading = false,
}: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
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
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full sm:w-auto overflow-x-auto">
          <div className="flex bg-[#0F172A]/50 p-1 rounded-xl border border-white/10">
            {STATUS_TABS.map((tab) => {
              const isActive = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => onStatusFilterChange(tab.value)}
                  className={`whitespace-nowrap px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? "bg-lime-400 text-black shadow-lg"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onToggleAddForm}
            className="px-3 md:px-4 py-2 border rounded-xl font-medium transition-all shadow-[0_0_15px_rgba(163,230,53,0.15)] text-xs md:text-sm flex items-center justify-center gap-2 bg-lime-400/10 text-lime-400 border-lime-400/20 hover:bg-lime-400/20"
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

          <button
            type="button"
            onClick={onToggleUpload}
            className="px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-all text-xs md:text-sm flex items-center gap-2 text-gray-300"
          >
            <Upload size={16} /> Upload CSV
          </button>

          <button
            type="button"
            onClick={onDownloadExcel}
            disabled={exportExcelLoading}
            className="px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-all text-xs md:text-sm flex items-center gap-2 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            {exportExcelLoading ? "Excel…" : "Excel"}
          </button>

          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={exportPdfLoading}
            className="px-3 md:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-all text-xs md:text-sm flex items-center gap-2 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText size={16} />
            {exportPdfLoading ? "PDF…" : "PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
