"use client";

import { lazy, Suspense } from "react";
import PageHeader from "../../common/PageHeader";
import TimellyLoader from "../../common/TimellyLoader";
import { SelectField } from "./MarksSelectField";
import { Save, ClipboardList, PenLine, Download, X } from "lucide-react";
import DataTable from "../../common/TableLayout";
import type { StudentRow } from "./shared";
import { useMarksEntryState } from "./shared";

const TeacherReportCard = lazy(() => import("./ReportCard"));
const SchoolAdminDownloadReports = lazy(
  () => import("../../schooladmin/marks/DownloadReports")
);
const DownloadClassPdf = lazy(
  () => import("../../schooladmin/marks/DownloadClassPdf")
);

export default function TeacherMarksTab() {
  const {
    subTab,
    setSubTab,
    classesLoading,
    classes,
    subjectsLoading,
    subjectOptions,
    form,
    handleChange,
    classOptions,
    sectionOptions,
    examTypeOptions,
    maxMarksLocked,
    markSetup,
    hasSubsections,
    termSections,
    sectionsTotalMax,
    updateMaxMarks,
    updateComponentScore,
    marksTableRef,
    savePopup,
    setSavePopup,
    activeBtn,
    setActiveBtn,
    loading,
    columns,
    rows,
    updateMarks,
    toggleAbsent,
    editingMaxId,
    setEditingMaxId,
    editingMaxValue,
    setEditingMaxValue,
    commitEditMaxMarks,
    startEditMaxMarks,
    getPercentage,
    getGrade,
    total,
    entered,
    absentCount,
    pending,
    saveMessage,
    saveLoading,
    handleSaveAll,
    displayClass,
  } = useMarksEntryState();

  const alreadySavedNames = (savePopup ?? []).filter((row) => row.status === "already_saved");
  const newlySavedNames = (savePopup ?? []).filter((row) => row.status === "saved");

  return (
    <div className="min-h-screen text-white px-3 sm:px-6 lg:px-8 py-4">
      {savePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12141c] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Successfully saved</h3>
                <p className="mt-1 text-xs text-white/50">
                  Names below are the ones stored in the database.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSavePopup(null)}
                className="rounded-full p-1.5 text-white/60 hover:bg-white/10"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            {alreadySavedNames.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-white/40">Already saved</p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-white">
                  {alreadySavedNames.map((row) => (
                    <li key={row.id}>{row.studentName}</li>
                  ))}
                </ul>
              </div>
            )}
            {newlySavedNames.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-lime-400/80">Saved now</p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-white">
                  {newlySavedNames.map((row) => (
                    <li key={row.id}>{row.studentName}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSavePopup(null)}
              className="mt-5 w-full rounded-xl bg-lime-400 py-2.5 text-sm font-bold text-black"
            >
              OK
            </button>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title={subTab === "entry" ? "Marks Entry" : subTab === "report-card" ? "Report Card" : "Download Reports"}
          subtitle={subTab === "entry" ? "Enter and manage student marks for your classes" : subTab === "report-card" ? "View and download student report cards" : "Download marks reports for classes as Excel or PDF"}
        />

        {/* SUB-TAB TOGGLE */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
          <button
            onClick={() => setSubTab("entry")}
            className={`shrink-0 px-3.5 sm:px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
              subTab === "entry"
                ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <PenLine size={15} className="shrink-0" />
            <span className="sm:hidden">Entry</span>
            <span className="hidden sm:inline">Marks Entry</span>
          </button>
          <button
            onClick={() => setSubTab("report-card")}
            className={`shrink-0 px-3.5 sm:px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
              subTab === "report-card"
                ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <ClipboardList size={15} className="shrink-0" />
            <span className="sm:hidden">Reports</span>
            <span className="hidden sm:inline">Report Card</span>
          </button>
          <button
            onClick={() => setSubTab("download")}
            className={`shrink-0 px-3.5 sm:px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
              subTab === "download"
                ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Download size={15} className="shrink-0" />
            <span className="sm:hidden">Download</span>
            <span className="hidden sm:inline">Download Reports</span>
          </button>
        </div>

        {subTab === "report-card" ? (
          <Suspense fallback={<div className="flex justify-center py-16"><div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" /></div>}>
            <div className="space-y-6">
              <DownloadClassPdf />
              <TeacherReportCard scope="school" />
            </div>
          </Suspense>
        ) : subTab === "download" ? (
          <Suspense fallback={<div className="flex justify-center py-16"><div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" /></div>}>
            <SchoolAdminDownloadReports />
          </Suspense>
        ) : (
        <>

        {classesLoading && classes.length === 0 && (
          <TimellyLoader title="Loading classes" steps={["Classes", "Subjects", "Marks"]} />
        )}

        {/* FILTER BAR */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6">
          {!subjectsLoading && subjectOptions.length === 0 && (
            <p className="mb-4 text-sm text-amber-300/90">
              No subjects assigned — contact admin to assign subjects on your teacher profile.
            </p>
          )}
          {!classesLoading && classes.length === 0 && (
            <p className="mb-4 text-sm text-amber-300/90">
              No classes assigned — contact admin to assign classes on your teacher profile.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SelectField
              label="CLASS"
              value={form.classLabel || ""}
              onChange={(v) => handleChange("class", v)}
              options={classOptions.length ? classOptions.map((o) => o.label) : ["Select class"]}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
            />
            <SelectField
              label="SECTION"
              value={form.section}
              onChange={(v) => handleChange("section", v)}
              options={sectionOptions}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
            />
            <SelectField
              label="SUBJECT"
              value={form.subject}
              onChange={(v) => handleChange("subject", v)}
              options={subjectOptions.length ? subjectOptions : ["No subjects assigned"]}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
            />
            <SelectField
              label="EXAM TYPE"
              value={form.examType}
              onChange={(v) => handleChange("examType", v)}
              options={examTypeOptions}
              className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
            />
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1.5">MAX MARKS</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={form.maxMarks}
                placeholder="Clear to reset all"
                readOnly={maxMarksLocked}
                disabled={maxMarksLocked}
                onChange={(e) => updateMaxMarks(e.target.value)}
                className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm disabled:opacity-70 disabled:cursor-not-allowed"
              />
              <p className="mt-1 text-[10px] text-white/40">
                {markSetup.source === "subject" && hasSubsections
                  ? `From ${form.subject} subsections (sum ${sectionsTotalMax})`
                  : markSetup.source === "subject"
                    ? `Set by school admin for ${form.subject}`
                    : hasSubsections
                      ? `From exam type subsections (sum ${sectionsTotalMax})`
                      : maxMarksLocked
                        ? "Set by school admin for this exam type"
                        : "Clear this field to clear max marks for all students"}
              </p>
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row gap-4">
          {[
            { key: "save", label: "Save Marks", icon: Save },
          ].map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.key}
                onClick={() => setActiveBtn(btn.key as "save" | "import" | "export")}
                className={`px-6 py-3 rounded-2xl flex items-center gap-2 text-sm font-medium transition
                  ${
                    activeBtn === btn.key
                      ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                      : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
                  }`}
              >
                <Icon size={16} />
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* TABLE CARD */}
        <div ref={marksTableRef} className="glass-card rounded-2xl overflow-hidden border border-white/10 flex flex-col">
          <div className="p-6 border-b border-white/10 bg-white/[0.02]">
            <h3 className="font-bold text-white text-lg">Enter Marks</h3>
            <div className="flex items-center gap-2 mt-2 text-sm text-white/60">
              <span>{displayClass}</span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span>{form.subject}</span>
              <span className="w-1 h-1 rounded-full bg-white/40" />
              <span className="text-lime-400 font-medium">{form.examType}</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <DataTable<StudentRow>
                  columns={columns}
                  rounded={false}
                  scrollableWide
                  stickyFirstColumn
                  stickyLeadingCount={2}
                  data={rows}
                  rowKey={(row) => row.id}
                  emptyText="No students in this class. Select a class above."
                />
              </div>

              <div className="md:hidden space-y-4 p-4">
                {rows.length === 0 ? (
                  <p className="text-white/60 text-center py-6">No students in this class.</p>
                ) : (
                  rows.map((student) => {
                    const percentage = getPercentage(student.marks, student.maxMarks);
                    const grade = getGrade(student.marks, student.maxMarks);
                    return (
                      <div
                        key={student.id}
                        className="rounded-2xl p-5 border border-white/10 bg-gradient-to-br from-purple-700/40 via-indigo-700/30 to-purple-900/40 backdrop-blur-xl shadow-xl"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <img src={student.avatar} alt={student.name} className="w-12 h-12 rounded-full flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-white font-semibold truncate">{student.name}</div>
                              <div className="text-xs text-white/60">Roll: {student.rollNo}</div>
                            </div>
                          </div>
                          <span className="px-3 py-1 rounded-full text-xs border bg-lime-400/20 text-lime-400 border-lime-400/40 flex-shrink-0">
                            {grade}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-col gap-3">
                          {hasSubsections ? (
                            <>
                              {termSections.map((sec) => {
                                const val = student.componentScores?.[sec.name];
                                return (
                                  <div key={sec.name} className="flex items-center justify-between gap-4">
                                    <label className="text-xs text-white/60 shrink-0 min-w-0">
                                      <span className="block truncate">{sec.name}</span>
                                      <span className="text-white/40">/ {sec.maxMarks}</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                      {val === "AB" || student.marks === "AB" ? (
                                        <span className="w-24 text-center text-red-400 font-semibold text-sm py-2">
                                          AB
                                        </span>
                                      ) : (
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min={0}
                                          max={sec.maxMarks}
                                          value={val === undefined || val === "" ? "" : val}
                                          onChange={(e) =>
                                            updateComponentScore(student.id, sec.name, e.target.value)
                                          }
                                          className="w-24 text-center rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white text-sm outline-none focus:border-lime-400/50"
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/10">
                                <span className="text-xs text-white/60">Total</span>
                                <div className="flex items-center gap-2">
                                  <span className="w-24 text-center text-white font-semibold text-sm py-2">
                                    {student.marks === "AB" ? "AB" : student.marks === "" ? "—" : student.marks}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => toggleAbsent(student.id)}
                                    className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition ${
                                      student.marks === "AB"
                                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                                        : "bg-white/5 text-white/40 border-white/10"
                                    }`}
                                  >
                                    AB
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center justify-between gap-4">
                              <label className="text-xs text-white/60 shrink-0">Marks Obtained</label>
                              <div className="flex items-center gap-2">
                                {student.marks === "AB" ? (
                                  <span className="w-24 text-center text-red-400 font-semibold text-sm py-2">
                                    Absent
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={student.maxMarks === "" ? undefined : student.maxMarks}
                                    value={student.marks === "" ? "" : student.marks}
                                    onChange={(e) => updateMarks(student.id, e.target.value)}
                                    className="w-24 text-center rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white text-sm outline-none focus:border-lime-400/50"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => toggleAbsent(student.id)}
                                  className={`px-2.5 py-2 rounded-lg text-xs font-bold border transition ${
                                    student.marks === "AB"
                                      ? "bg-red-500/20 text-red-400 border-red-500/30"
                                      : "bg-white/5 text-white/40 border-white/10"
                                  }`}
                                >
                                  AB
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="flex justify-between text-sm items-center gap-3">
                            <span className="text-white/60 shrink-0">Max</span>
                            {editingMaxId === student.id && !maxMarksLocked ? (
                              <input
                                type="number"
                                autoFocus
                                min={1}
                                max={1000}
                                value={editingMaxValue}
                                onChange={(e) => setEditingMaxValue(e.target.value)}
                                onBlur={() => commitEditMaxMarks(student.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitEditMaxMarks(student.id);
                                  }
                                  if (e.key === "Escape") {
                                    setEditingMaxId(null);
                                    setEditingMaxValue("");
                                  }
                                }}
                                className="w-24 text-center rounded-lg bg-white/10 border border-lime-400/50 px-3 py-2 text-white text-sm outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                title={
                                  maxMarksLocked
                                    ? "Locked by school admin"
                                    : "Double-tap to edit max marks"
                                }
                                onDoubleClick={() => {
                                  if (!maxMarksLocked) {
                                    startEditMaxMarks(student.id, student.maxMarks);
                                  }
                                }}
                                className="text-white font-semibold px-2 py-1 rounded-lg hover:bg-white/10"
                              >
                                {student.maxMarks === "" ? "—" : student.maxMarks}
                              </button>
                            )}
                            <span className="text-white font-semibold ml-auto">{percentage}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white/[0.02] border-t border-white/10">
                <div className="flex gap-6 text-sm">
                  <span className="text-gray-400">
                    TOTAL <span className="text-white font-semibold ml-1">{total}</span>
                  </span>
                  <span className="text-lime-400">
                    ENTERED <span className="font-semibold ml-1">{entered}</span>
                  </span>
                  {absentCount > 0 && (
                    <span className="text-red-400">
                      ABSENT <span className="font-semibold ml-1">{absentCount}</span>
                    </span>
                  )}
                  <span className="text-red-400">
                    PENDING <span className="font-semibold ml-1">{pending}</span>
                  </span>
                </div>
                {saveMessage ? (
                  <span className="text-sm text-white/70">{saveMessage}</span>
                ) : null}
                <button
                  disabled={saveLoading || entered === 0}
                  onClick={handleSaveAll}
                  className={`px-5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition
                    ${
                      !saveLoading && entered > 0
                        ? "bg-lime-400/20 text-lime-400 border border-lime-400/30 hover:shadow-[0_0_15px_rgba(163,230,53,0.2)]"
                        : "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed"
                    }`}
                >
                  <Save size={16} />
                  {saveLoading ? "Saving…" : pending > 0 ? `Save ${entered} of ${total}` : "Save All Marks"}
                </button>
              </div>
            </>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
