import React, { forwardRef } from "react";
import { format } from "date-fns";

export interface AttendanceReportData {
  schoolName?: string;
  studentName: string;
  studentClass: string;
  dateGenerated: string | Date;
  summary: {
    present: number;
    absent: number;
    late: number;
    total: number;
    presentRate: number;
  };
}

interface AttendanceReportTemplateProps {
  data: AttendanceReportData | null;
}

const AttendanceReportTemplate = forwardRef<HTMLDivElement, AttendanceReportTemplateProps>(
  ({ data }, ref) => {
    if (!data) return null;

    const formattedDate = format(new Date(data.dateGenerated), "dd MMMM yyyy");

    return (
      <div
        style={{
          position: "fixed",
          top: "-9999px",
          left: "-9999px",
          zIndex: -9999,
        }}
      >
        <div
          ref={ref}
          className="p-12 font-sans relative overflow-hidden"
          style={{ width: "800px", minHeight: "1131px", backgroundColor: "#ffffff" }} // A4 aspect ratio 1:1.414
        >
          {/* Decorative Top Banner */}
          <div className="absolute top-0 left-0 w-full h-4" style={{ background: "linear-gradient(to right, #a3e635, #10b981)" }} />
          
          {/* Header */}
          <div className="flex justify-between items-end border-b-2 pb-8 mb-10 mt-6" style={{ borderColor: "#f1f5f9" }}>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-4" style={{ color: "#1e293b" }}>
                {data.schoolName || "School"}
              </h1>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-black uppercase tracking-widest mb-2" style={{ color: "#cbd5e1" }}>
                ATTENDANCE REPORT
              </h2>
              <p className="text-sm font-semibold" style={{ color: "#64748b" }}>
                Generated on: {formattedDate}
              </p>
            </div>
          </div>

          {/* Student Info */}
          <div className="rounded-2xl p-6 border mb-10 flex justify-between items-center" style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#94a3b8" }}>
                Student Name
              </h3>
              <p className="text-2xl font-bold" style={{ color: "#1e293b" }}>{data.studentName}</p>
            </div>
            <div className="text-right">
              <h3 className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#94a3b8" }}>
                Class / Section
              </h3>
              <p className="text-xl font-bold" style={{ color: "#334155" }}>{data.studentClass}</p>
            </div>
          </div>

          {/* Attendance Stats Cards */}
          <div className="grid grid-cols-2 gap-6 mb-10">
            {/* Present Rate Card */}
            <div className="rounded-2xl border-2 p-6 flex items-center justify-between" style={{ backgroundColor: "#ecfdf5", borderColor: "#d1fae5" }}>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: "#059669" }}>
                  Overall Present Rate
                </p>
                <div className="text-5xl font-black" style={{ color: "#10b981" }}>
                  {data.summary.presentRate.toFixed(1)}%
                </div>
              </div>
              <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center" style={{ borderColor: "#a7f3d0", color: "#6ee7b7" }}>
                <svg
                  className="w-10 h-10"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
              </div>
            </div>

            {/* Total Days */}
            <div className="rounded-2xl border-2 p-6 flex flex-col justify-center" style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}>
              <p className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: "#64748b" }}>
                Total School Days
              </p>
              <div className="text-4xl font-black" style={{ color: "#1e293b" }}>
                {data.summary.total}
              </div>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <h3 className="text-lg font-bold uppercase tracking-widest mb-6 border-l-4 pl-3" style={{ color: "#1e293b", borderColor: "#84cc16" }}>
            Attendance Breakdown
          </h3>
          <div className="grid grid-cols-3 gap-6 mb-12">
            <div className="border rounded-xl p-6 text-center shadow-sm" style={{ borderColor: "#f1f5f9" }}>
              <div className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
                Present
              </div>
              <div className="text-3xl font-bold" style={{ color: "#10b981" }}>
                {data.summary.present}
              </div>
              <div className="text-xs mt-2 font-medium" style={{ color: "#64748b" }}>Days</div>
            </div>
            <div className="border rounded-xl p-6 text-center shadow-sm" style={{ borderColor: "#f1f5f9" }}>
              <div className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
                Absent
              </div>
              <div className="text-3xl font-bold" style={{ color: "#ef4444" }}>
                {data.summary.absent}
              </div>
              <div className="text-xs mt-2 font-medium" style={{ color: "#64748b" }}>Days</div>
            </div>
            <div className="border rounded-xl p-6 text-center shadow-sm" style={{ borderColor: "#f1f5f9" }}>
              <div className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
                Late
              </div>
              <div className="text-3xl font-bold" style={{ color: "#f97316" }}>
                {data.summary.late}
              </div>
              <div className="text-xs mt-2 font-medium" style={{ color: "#64748b" }}>Arrivals</div>
            </div>
          </div>

          {/* Decorative end line */}
          <div className="mt-auto pt-16 text-center">
            <div className="w-16 h-1 mx-auto mb-6 rounded-full" style={{ backgroundColor: "#e2e8f0" }} />
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#94a3b8" }}>
              End of Report
            </p>
            <p className="text-xs mt-2" style={{ color: "#94a3b8" }}>
              This is an official computer-generated document.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                style={{ backgroundColor: "#84cc16", color: "#ffffff" }}
              >
                T
              </span>
              <p className="text-xs font-semibold tracking-wide" style={{ color: "#64748b" }}>
                Powered by Timelly
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

AttendanceReportTemplate.displayName = "AttendanceReportTemplate";
export default AttendanceReportTemplate;
