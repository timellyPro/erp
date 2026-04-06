import React, { forwardRef } from "react";
import { format } from "date-fns";

export interface MarksReportData {
  schoolName?: string;
  studentName: string;
  studentClass: string;
  dateGenerated: string | Date;
  overallScore: number;
  overallGrade: string;
  totalMarks: number;
  totalMaxMarks: number;
  rank: number | null;
  marks: Array<{
    subject: string;
    marks: number;
    totalMarks: number;
    grade: string | null;
    examType?: string | null;
  }>;
}

interface MarksReportTemplateProps {
  data: MarksReportData | null;
}

const MarksReportTemplate = forwardRef<HTMLDivElement, MarksReportTemplateProps>(
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
          className="p-12 font-sans relative overflow-hidden flex flex-col"
          style={{ width: "800px", minHeight: "1131px", backgroundColor: "#ffffff" }} // A4 aspect ratio 1:1.414
        >
          {/* Decorative Top Banner */}
          <div className="absolute top-0 left-0 w-full h-4" style={{ background: "linear-gradient(to right, #3b82f6, #4f46e5)" }} />
          
          {/* Header */}
          <div className="flex justify-between items-end border-b-2 pb-8 mb-10 mt-6" style={{ borderColor: "#f1f5f9" }}>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-4" style={{ color: "#1e293b" }}>
                {data.schoolName || "School"}
              </h1>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-black uppercase tracking-widest mb-2" style={{ color: "#cbd5e1" }}>
                ACADEMIC REPORT
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

          {/* Marks Stats Cards */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            {/* Overall Score Card */}
            <div className="rounded-2xl border shadow-sm p-6 text-center flex flex-col justify-center" style={{ backgroundColor: "#ffffff", borderColor: "#f1f5f9" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
                Overall Score
              </p>
              <div className="text-4xl font-black" style={{ color: "#2563eb" }}>
                {data.overallScore.toFixed(1)}%
              </div>
            </div>

            {/* Overall Grade Card */}
            <div className="rounded-2xl border shadow-sm p-6 text-center flex flex-col justify-center" style={{ backgroundColor: "#ffffff", borderColor: "#f1f5f9" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
                Overall Grade
              </p>
              <div className="text-4xl font-black" style={{ color: "#6366f1" }}>
                {data.overallGrade}
              </div>
            </div>

            {/* Rank Card */}
            <div className="rounded-2xl border shadow-sm p-6 text-center flex flex-col justify-center" style={{ backgroundColor: "#ffffff", borderColor: "#f1f5f9" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>
                Class Rank
              </p>
              <div className="text-4xl font-black" style={{ color: "#f59e0b" }}>
                {data.rank ? `#${data.rank}` : "N/A"}
              </div>
            </div>
          </div>

          {/* Detailed Marks Breakdown */}
          <h3 className="text-lg font-bold uppercase tracking-widest mb-6 border-l-4 pl-3" style={{ color: "#1e293b", borderColor: "#3b82f6" }}>
            Subject Performance
          </h3>
          
          <div className="rounded-2xl overflow-hidden border mb-10" style={{ borderColor: "#e2e8f0" }}>
            <table className="w-full text-sm text-left">
              <thead className="uppercase text-xs font-bold tracking-wider" style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
                <tr>
                  <th className="px-6 py-4">Subject</th>
                  <th className="px-6 py-4 text-center">Marks Obtained</th>
                  <th className="px-6 py-4 text-center">Total Marks</th>
                  <th className="px-6 py-4 text-center">Percentage</th>
                  <th className="px-6 py-4 text-right">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ backgroundColor: "#ffffff", borderColor: "#f1f5f9" }}>
                {data.marks.map((m, idx) => {
                  const percentage = m.totalMarks > 0 ? (m.marks / m.totalMarks) * 100 : 0;
                  return (
                    <tr key={idx}>
                      <td className="px-6 py-4 font-semibold pt-5" style={{ color: "#1e293b" }}>
                        {m.subject}
                        {m.examType && (
                          <span className="block text-xs font-medium mt-1" style={{ color: "#94a3b8" }}>
                            {m.examType}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center font-bold" style={{ color: "#334155" }}>
                        {m.marks}
                      </td>
                      <td className="px-6 py-4 text-center font-medium" style={{ color: "#64748b" }}>
                        {m.totalMarks}
                      </td>
                      <td className="px-6 py-4 text-center font-bold" style={{ color: "#2563eb" }}>
                        {percentage.toFixed(1)}%
                      </td>
                      <td className="px-6 py-4 text-right font-bold" style={{ color: "#1e293b" }}>
                        {m.grade || "N/A"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2" style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}>
                <tr>
                  <td className="px-6 py-4 font-black uppercase text-xs tracking-wider" style={{ color: "#1e293b" }}>
                    Total
                  </td>
                  <td className="px-6 py-4 text-center font-black" style={{ color: "#1e293b" }}>
                    {data.totalMarks}
                  </td>
                  <td className="px-6 py-4 text-center font-black" style={{ color: "#1e293b" }}>
                    {data.totalMaxMarks}
                  </td>
                  <td className="px-6 py-4 text-center font-black" style={{ color: "#2563eb" }}>
                    {data.overallScore.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-right font-black" style={{ color: "#4f46e5" }}>
                    {data.overallGrade}
                  </td>
                </tr>
              </tfoot>
            </table>
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

MarksReportTemplate.displayName = "MarksReportTemplate";
export default MarksReportTemplate;
