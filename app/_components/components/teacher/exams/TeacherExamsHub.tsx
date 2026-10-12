"use client";

import { useState, lazy, Suspense } from "react";
import { BookOpen, ClipboardList, Download } from "lucide-react";
import ExamsPage from "../../schooladmin/exams/exams";

const TeacherReportCard = lazy(() => import("../marks/ReportCard"));
const SchoolAdminDownloadReports = lazy(
  () => import("../../schooladmin/marks/DownloadReports")
);
const DownloadClassPdf = lazy(
  () => import("../../schooladmin/marks/DownloadClassPdf")
);

type SubTab = "exams" | "report-card" | "download";

const TABS: Array<{ id: SubTab; label: string; short: string; icon: typeof BookOpen }> = [
  { id: "exams", label: "Exams & Syllabus", short: "Exams", icon: BookOpen },
  { id: "report-card", label: "Report Card", short: "Reports", icon: ClipboardList },
  { id: "download", label: "Download Reports", short: "Download", icon: Download },
];

export default function TeacherExamsHub() {
  const [subTab, setSubTab] = useState<SubTab>("exams");

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4">
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1">
          {TABS.map(({ id, label, short, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`shrink-0 px-3.5 sm:px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
                subTab === id
                  ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                  : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
              }`}
            >
              <Icon size={15} className="shrink-0" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {subTab === "exams" ? (
        <ExamsPage />
      ) : subTab === "report-card" ? (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-8 space-y-6">
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
              </div>
            }
          >
            <DownloadClassPdf />
            <TeacherReportCard scope="school" />
          </Suspense>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-8">
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
              </div>
            }
          >
            <SchoolAdminDownloadReports />
          </Suspense>
        </div>
      )}
    </div>
  );
}
