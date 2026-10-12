"use client";

import { type ReactNode } from "react";
import {
  Download,
  GraduationCap,
  User,
  Calendar,
} from "lucide-react";
import ParentTimellyLoader from "../ParentTimellyLoader";
import ProfileReportTemplate from "../../pdf/ProfileReportTemplate";
import PageHeader from "../../common/PageHeader";
import { useParentProfileState } from "./shared";
import { AcademicPerformanceChart } from "./shared";
import { StudentDetailsSection } from "./shared";

export default function ParentProfile() {
  const {
    status,
    profile,
    user,
    loading,
    error,
    pdfLoading,
    pdfReportData,
    reportRef,
    examTypeFilter,
    setExamTypeFilter,
    academicYear,
    marks,
    filteredPerformance,
    stats,
    profileReportPreview,
    generatePdf,
  } = useParentProfileState();

  let content: ReactNode;

  if (status === "loading" || loading) {
    content = (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center">
        <ParentTimellyLoader preset="profile" className="w-full max-w-2xl" />
      </div>
    );
  } else if (error && !profile) {
    content = (
      <div className="min-h-screen p-4 sm:p-6 md:p-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    );
  } else if (!profile) {
    content = null;
  } else {
    const s = profile.student;
    const photoUrl = s.photoUrl || user?.photoUrl || null;

    const examTypeOptions = (() => {
      const types = new Set<string>();
      marks.forEach((m) => {
        if (m.examType && m.examType.trim()) {
          types.add(m.examType.trim());
        }
      });
      return ["ALL", ...Array.from(types).sort()];
    })();

    content = (
    <div className="min-h-screen p-3 sm:p-5 md:p-6 pb-20 sm:pb-6 overflow-x-hidden">
      <main className="max-w-6xl mx-auto space-y-5 md:space-y-7">
        {/* Header: student name + overview */}
        <PageHeader
  title="Student Profile"
  subtitle="Manage student records and information"
  rightSlot={
    <button
      onClick={() => void generatePdf()}
      disabled={pdfLoading}
      className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl
                 bg-lime-400/10 border border-lime-400/40
                 text-lime-300 text-sm font-medium
                 hover:bg-lime-400/20 hover:shadow-lg
                 transition-all duration-200
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download className="w-4 h-4" />
      {pdfLoading ? "Generating..." : "Download Report"}
    </button>
  }

/>
        {/* Profile card: image + name + tags */}
        <section className="rounded-xl sm:rounded-2xl md:rounded-3xl  somu p-3 sm:p-4 md:p-6 lg:p-8 transition-all duration-200 hover:border-white/20">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 sm:gap-6">
            <div className="flex flex-col gap-6 min-w-0 flex-1">
              {/* Name and Subtitle Section */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shrink-0">
                  <GraduationCap className="w-8 h-8 md:w-10 md:h-10 text-lime-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
                    {s.name || "Student"}
                  </h2>
                  <p className="text-white/50 text-lg mt-1">Student Profile Overview</p>
                </div>
              </div>

              {/* Tags Row 1: Class and Roll */}
              <div className="flex flex-wrap gap-3">
                {s.class?.displayName && (
                  <div className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-6 py-3 rounded-3xl text-white font-medium">
                    <User className="w-5 h-5 text-lime-400" />
                    <span className="text-lg">Class {s.class.displayName}</span>
                  </div>
                )}
                {s.rollNo && (
                  <div className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-6 py-3 rounded-3xl text-white font-medium">
                    <span className="text-lg text-white/90">Roll: {s.rollNo}</span>
                  </div>
                )}
              </div>

              {/* Tags Row 2: Admission and Academic Year */}
              <div className="flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-2 rounded-2xl text-white/60">
                  <span className="text-sm font-medium uppercase tracking-wider">{s.admissionNumber}</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-2 rounded-2xl text-white/60">
                  <Calendar className="w-4 h-4 text-lime-400" />
                  <span className="text-sm font-medium">{academicYear}</span>
                </div>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-stretch gap-4 md:items-end md:justify-between">
              {/* Avatar */}
              <div className="relative h-24 w-24 sm:h-32 sm:w-32 md:h-44 md:w-44 lg:h-52 lg:w-52 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-white/20 bg-white/5 transition-all duration-200 hover:border-lime-400/40 hover:shadow-lg">
                {photoUrl ? (
                   
                  <img
                    src={photoUrl}
                    alt={s.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-white/5">
                    <User className="w-16 h-16 sm:w-20 sm:h-20 text-white/40" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <AcademicPerformanceChart
            filteredPerformance={filteredPerformance}
            examTypeOptions={examTypeOptions}
            examTypeFilter={examTypeFilter}
            onExamTypeFilterChange={setExamTypeFilter}
          />

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-5 mt-10">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-xl sm:rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-3 sm:p-4 md:p-6 text-center transition-all duration-200 hover:border-white/20 hover:shadow-lg hover:scale-[1.02]"
              >
                <item.icon className="mx-auto w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-lime-400 mb-1.5 sm:mb-2 md:mb-3" />
                <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-white truncate">{item.value}</h3>
                <p className="text-white/60 text-xs sm:text-sm uppercase tracking-wide mt-1">
                  {item.label}
                </p>
              </div>
            ))}
          </div>

        </section>

        <StudentDetailsSection student={s} userMobile={user?.mobile} />

      </main>
    </div>
    );
  }

  return (
    <>
      {content}
      {profileReportPreview ? (
        <ProfileReportTemplate
          ref={reportRef}
          data={pdfReportData ?? profileReportPreview}
        />
      ) : null}
    </>
  );
}
