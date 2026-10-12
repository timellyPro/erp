"use client";

import { SelectField } from "./MarksSelectField";
import { Search, BookOpen, TrendingUp, Award } from "lucide-react";
import MarksReportTemplate from "@/app/_components/components/pdf/MarksReportTemplate";
import { useReportCardState } from "./shared";
import { StatCard } from "./shared";
import { ReportCardStudentList } from "./shared";
import { ReportCardStudentHeader } from "./shared";
import { ReportCardMarksTable } from "./shared";

export default function TeacherReportCard({
  scope = "teacher",
}: {
  /** teacher = assigned classes only; school = all school classes */
  scope?: "teacher" | "school";
}) {
  const {
    classesLoading,
    students,
    studentsLoading,
    examTypeOptions,
    searchQuery,
    setSearchQuery,
    selectedClassLabel,
    selectedStudentId,
    selectedExamType,
    setSelectedExamType,
    reportData,
    reportLoading,
    pdfLoading,
    expandedSubject,
    setExpandedSubject,
    pdfRef,
    classOptions,
    filteredStudents,
    pdfData,
    displaySchoolLogo,
    handleDownloadPdf,
    handlePrint,
    handleClassChange,
    handleStudentSelect,
  } = useReportCardState({ scope });

  return (
    <div className="space-y-6">
      {/* FILTER BAR */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SelectField
            label="CLASS"
            value={selectedClassLabel}
            onChange={handleClassChange}
            options={
              classOptions.length
                ? classOptions.map((o) => o.label)
                : ["Select class"]
            }
            className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
          />
          <SelectField
            label="EXAM TYPE"
            value={selectedExamType}
            onChange={setSelectedExamType}
            options={examTypeOptions}
            className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
          />
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-widest">
              SEARCH STUDENT
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                type="text"
                placeholder="Name or Roll No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm placeholder:text-white/30"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <ReportCardStudentList
          filteredStudents={filteredStudents}
          students={students}
          classesLoading={classesLoading}
          studentsLoading={studentsLoading}
          selectedStudentId={selectedStudentId}
          onSelectStudent={handleStudentSelect}
        />

        {/* REPORT CARD */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedStudentId ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 flex flex-col items-center justify-center text-center">
              <BookOpen size={48} className="text-white/20 mb-4" />
              <h3 className="text-lg font-semibold text-white/60">
                Select a Student
              </h3>
              <p className="text-sm text-white/30 mt-1 max-w-sm">
                Choose a student from the list to view their report card
              </p>
            </div>
          ) : reportLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
            </div>
          ) : !reportData || reportData.marks.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 flex flex-col items-center justify-center text-center">
              <Award size={48} className="text-white/20 mb-4" />
              <h3 className="text-lg font-semibold text-white/60">
                No Marks Found
              </h3>
              <p className="text-sm text-white/30 mt-1 max-w-sm">
                No marks have been entered for this student yet
              </p>
            </div>
          ) : (
            <>
              <ReportCardStudentHeader
                reportData={reportData}
                displaySchoolLogo={displaySchoolLogo}
                pdfLoading={pdfLoading}
                onDownloadPdf={handleDownloadPdf}
                onPrint={handlePrint}
              />

              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard
                  icon={TrendingUp}
                  label="Overall %"
                  value={`${reportData.summary.overallPercentage}%`}
                />
                <StatCard
                  icon={Award}
                  label="Grade"
                  value={reportData.summary.overallGrade}
                />
                <StatCard
                  icon={BookOpen}
                  label="Subjects"
                  value={reportData.summary.totalSubjects}
                  sub={`${reportData.summary.totalObtained}/${reportData.summary.totalMax}`}
                />
              </div>

              <ReportCardMarksTable
                reportData={reportData}
                selectedExamType={selectedExamType}
                expandedSubject={expandedSubject}
                onExpandedSubjectChange={setExpandedSubject}
              />
            </>
          )}
        </div>
      </div>

      {/* Hidden PDF template for download/print */}
      <MarksReportTemplate ref={pdfRef} data={pdfData} />
    </div>
  );
}
