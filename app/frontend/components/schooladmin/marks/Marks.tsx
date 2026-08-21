"use client";

import { useState, lazy, Suspense } from "react";
import PageHeader from "../../common/PageHeader";
import { ClipboardList, Download } from "lucide-react";

const TeacherReportCard = lazy(() => import("../../teacher/marks/ReportCard"));
const SchoolAdminDownloadReports = lazy(() => import("./DownloadReports"));

export default function SchoolAdminMarksTab() {
  const [subTab, setSubTab] = useState<"report-card" | "download">("download");

  return (
    <div className="min-h-screen text-white px-3 sm:px-6 lg:px-8 py-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title={subTab === "report-card" ? "Report Card" : "Download Reports"}
          subtitle={
            subTab === "report-card"
              ? "View and download student report cards"
              : "Download consolidated marks for all classes or selected sections"
          }
        />

        <div className="flex gap-2">
          <button
            onClick={() => setSubTab("report-card")}
            className={`px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
              subTab === "report-card"
                ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <ClipboardList size={15} />
            Report Card
          </button>
          <button
            onClick={() => setSubTab("download")}
            className={`px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition ${
              subTab === "download"
                ? "bg-lime-400/20 text-lime-400 border border-lime-400/40 shadow-md"
                : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
            }`}
          >
            <Download size={15} />
            Download Reports
          </button>
        </div>

        {subTab === "report-card" ? (
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
              </div>
            }
          >
            <TeacherReportCard scope="school" />
          </Suspense>
        ) : (
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
              </div>
            }
          >
            <SchoolAdminDownloadReports />
          </Suspense>
        )}
      </div>
    </div>
  );
}
