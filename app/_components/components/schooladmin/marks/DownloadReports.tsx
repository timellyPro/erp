"use client";

import {
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { useDownloadReportsState } from "./shared/useDownloadReportsState";
import { ClassSectionPicker } from "./shared/ClassSectionPicker";

export default function SchoolAdminDownloadReports() {
  const {
    classesLoading,
    selectMode,
    selectedKeys,
    setSelectedKeys,
    examTypeOptions,
    selectedExamTypes,
    chosenExamTypes,
    toggleExamType,
    subjectOptions,
    selectedSubjects,
    classSearch,
    setClassSearch,
    downloading,
    downloadType,
    progress,
    filteredOptions,
    toggleKey,
    selectAllVisible,
    changeMode,
    toggleSubject,
    selectAllSubjects,
    handleDownloadExcel,
    handleDownloadPdf,
    allVisibleSelected,
  } = useDownloadReportsState();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 sm:p-6 space-y-5">
        <div>
          <h3 className="text-lg font-bold text-white">Consolidated Marks Download</h3>
          <p className="text-sm text-white/50 mt-1">
            Choose <span className="text-white/80">By class</span> to combine all sections
            (e.g. Class 10 A+B+C → one sheet), or{" "}
            <span className="text-white/80">By section</span> for separate sheets (10-A, 10-B).
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/60 mb-1.5">DOWNLOAD MODE</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => changeMode("class")}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                selectMode === "class"
                  ? "bg-lime-400/20 border-lime-400/40 text-lime-300"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
              }`}
            >
              By class (combine sections)
            </button>
            <button
              type="button"
              onClick={() => changeMode("section")}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                selectMode === "section"
                  ? "bg-lime-400/20 border-lime-400/40 text-lime-300"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
              }`}
            >
              By section (separate sheets)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-white/60 mb-1.5">
            EXAM TYPE <span className="text-white/35">(select one or more, then download)</span>
          </label>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto no-scrollbar">
            {examTypeOptions.map((name) => {
              const on = name === "ALL" ? selectedExamTypes.has("ALL") : selectedExamTypes.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleExamType(name)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    on
                      ? "bg-lime-400/20 border-lime-400/40 text-lime-300"
                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {on ? <Check size={12} strokeWidth={3} /> : null}
                  {name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-white/40">
            {chosenExamTypes().includes("ALL")
              ? "Download includes every exam type."
              : `Download includes ${chosenExamTypes().join(", ")}. Each exam type is a separate sheet.`}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-xs font-medium text-white/60">
              SUBJECTS <span className="text-white/35">(optional — leave empty for all)</span>
            </label>
            <button
              type="button"
              onClick={selectAllSubjects}
              className="text-xs text-lime-400 hover:underline"
            >
              {selectedSubjects.size === subjectOptions.length ? "Clear subjects" : "Select all subjects"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto no-scrollbar">
            {subjectOptions.length === 0 ? (
              <span className="text-xs text-white/40">No subjects configured</span>
            ) : (
              subjectOptions.map((s) => {
                const on = selectedSubjects.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSubject(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      on
                        ? "bg-lime-400/20 border-lime-400/40 text-lime-300"
                        : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                    }`}
                  >
                    {s}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <ClassSectionPicker
          selectMode={selectMode}
          selectedKeys={selectedKeys}
          classSearch={classSearch}
          onClassSearchChange={setClassSearch}
          allVisibleSelected={allVisibleSelected}
          onSelectAllVisible={selectAllVisible}
          classesLoading={classesLoading}
          filteredOptions={filteredOptions}
          onToggleKey={toggleKey}
        />

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 pt-2">
          <button
            type="button"
            disabled={downloading || selectedKeys.size === 0}
            onClick={() => void handleDownloadExcel()}
            className={`w-full sm:w-auto justify-center px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold transition ${
              !downloading && selectedKeys.size > 0
                ? "bg-lime-400 text-black hover:bg-lime-300"
                : "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
            }`}
          >
            {downloading && downloadType === "excel" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={16} />
            )}
            {downloading && downloadType === "excel" ? "Generating…" : "Download Excel"}
          </button>
          <button
            type="button"
            disabled={downloading || selectedKeys.size === 0}
            onClick={() => void handleDownloadPdf()}
            className={`w-full sm:w-auto justify-center px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold transition ${
              !downloading && selectedKeys.size > 0
                ? "bg-blue-500 text-white hover:bg-blue-400"
                : "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
            }`}
          >
            {downloading && downloadType === "pdf" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {downloading && downloadType === "pdf" ? "Generating…" : "Download PDF"}
          </button>
          {selectedKeys.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedKeys(new Set())}
              className="px-4 py-3 rounded-xl text-sm text-white/50 hover:text-white/80 flex items-center gap-1"
            >
              <X size={14} /> Clear selection
            </button>
          )}
          {progress ? (
            <span className="text-sm text-white/60 flex items-center gap-2">
              <Download size={14} /> {progress}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
