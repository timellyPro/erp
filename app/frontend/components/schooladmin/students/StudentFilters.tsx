"use client";

import {
  BookOpen,
  Download,
  Funnel,
  List,
  Plus,
  Search,
  Upload,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { SelectOption } from "./types";

type StatusFilter = "active" | "inactive" | "all";

type Props = {
  classOptions: SelectOption[];
  sectionOptions: SelectOption[];
  selectedClass: string;
  onClassChange: (value: string) => void;
  selectedSection: string;
  onSectionChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filteredCount: number;
  showAddForm: boolean;
  onToggleAddForm: () => void;
  onToggleUpload: () => void;
  onDownloadReport: (format?: "xlsx" | "pdf") => void;
  exportDetailsLoading?: boolean;
};

const STATUS_OPTIONS: {
  key: StatusFilter;
  label: string;
  icon: typeof List;
}[] = [
  { key: "active", label: "Active", icon: UserCheck },
  { key: "inactive", label: "Inactive", icon: UserX },
  { key: "all", label: "All", icon: List },
];

export default function StudentFilters({
  classOptions,
  sectionOptions,
  selectedClass,
  onClassChange,
  selectedSection,
  onSectionChange,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
  filteredCount,
  showAddForm,
  onToggleAddForm,
  onToggleUpload,
  onDownloadReport,
  exportDetailsLoading = false,
}: Props) {
  return (
    <section className="rounded-2xl p-6 lg:p-7 space-y-6 bg-white/5 backdrop-blur border border-white/10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Filter Students</h3>
          <p className="text-sm text-white/70">Pick a class for faster loading · search or export anytime</p>
        </div>
        <span className="self-start sm:self-auto rounded-full border border-lime-400/30 px-4 py-2 text-sm text-lime-300">
          {filteredCount.toLocaleString()} Results
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-300">
            <BookOpen className="w-4 h-4 text-lime-400" />
            Class
          </label>
          <select
            value={selectedClass}
            onChange={(e) => onClassChange(e.target.value)}
            className="w-full rounded-xl px-4 py-3 somu text-white border border-white/20 outline-none focus:border-lime-400 transition appearance-none"
          >
            {classOptions.map((opt) => (
              <option key={opt.value || "all"} value={opt.value} className="bg-gray-900">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-1">
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-300">
            Section
          </label>
          <select
            value={selectedSection}
            onChange={(e) => onSectionChange(e.target.value)}
            className="w-full rounded-xl px-4 py-3 somu text-white border border-white/20 outline-none focus:border-lime-400 transition appearance-none"
          >
            {sectionOptions.map((opt) => (
              <option key={opt.value || "all"} value={opt.value} className="bg-gray-900">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-300">
            <Search className="w-4 h-4 text-lime-400" />
            Search
          </label>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Name, ID, email, phone…"
            className="w-full rounded-xl px-4 py-3 somu text-white border border-white/20 outline-none focus:border-lime-400 transition placeholder:text-white/40"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-300">
          <Funnel className="w-4 h-4 text-lime-400" />
          Status
        </label>
        <div className="grid grid-cols-3 gap-3">
          {STATUS_OPTIONS.map(({ key, label, icon: Icon }) => {
            const isActive = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onStatusFilterChange(key)}
                className={`flex flex-col items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-medium transition-all border somu ${
                  isActive
                    ? "bg-lime-400/10 border-lime-400 text-lime-300 shadow-[0_0_15px_rgba(163,230,53,0.15)]"
                    : "border-white/20 text-gray-300 hover:border-white/40 hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="button"
          onClick={onToggleAddForm}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-lime-400/10 text-lime-300 border border-lime-400/30 hover:bg-lime-400/20 transition"
        >
          {showAddForm ? <X size={16} /> : <Plus size={16} />}
          {showAddForm ? "Close Form" : "Add Student"}
        </button>
        <button
          type="button"
          onClick={onToggleUpload}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-white/20 text-gray-300 hover:bg-white/5 transition"
        >
          <Upload size={16} /> Upload CSV
        </button>
        <button
          type="button"
          onClick={() => onDownloadReport("xlsx")}
          disabled={exportDetailsLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-white/20 text-gray-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <Download size={16} />
          {exportDetailsLoading ? "Exporting…" : "Excel"}
        </button>
        <button
          type="button"
          onClick={() => onDownloadReport("pdf")}
          disabled={exportDetailsLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-white/20 text-gray-300 hover:bg-white/5 transition disabled:opacity-50"
        >
          <Download size={16} />
          {exportDetailsLoading ? "Exporting…" : "PDF"}
        </button>
      </div>
    </section>
  );
}
