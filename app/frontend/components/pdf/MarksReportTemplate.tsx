import React, { forwardRef } from "react";
import {
  ParentDocumentBrand,
  ParentPortalDocumentShell,
  ParentPortalPdfMount,
} from "./ParentPortalDocumentShell";

export interface MarksReportData {
  schoolName?: string;
  schoolLogo?: string | null;
  schoolAddress?: string;
  studentName: string;
  studentClass: string;
  admissionNumber?: string;
  academicYear?: string;
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
    if (!data) {
      return (
        <ParentPortalPdfMount ref={ref}>
          <div style={{ width: "800px", minHeight: "1px", backgroundColor: "#ffffff" }} />
        </ParentPortalPdfMount>
      );
    }

    const brand: ParentDocumentBrand = {
      schoolName: data.schoolName || "School",
      schoolLogo: data.schoolLogo,
      schoolAddress: data.schoolAddress,
    };

    return (
      <ParentPortalPdfMount ref={ref}>
        <ParentPortalDocumentShell
          brand={brand}
          documentTitle="Academic Performance Report"
          generatedAt={data.dateGenerated}
          student={{
            studentName: data.studentName,
            className: data.studentClass,
            admissionNumber: data.admissionNumber,
            academicYear: data.academicYear,
            rightRows: [
              { label: "Overall Score", value: `${data.overallScore.toFixed(1)}%` },
              { label: "Overall Grade", value: data.overallGrade },
              { label: "Class Rank", value: data.rank ? `#${data.rank}` : "N/A" },
            ],
          }}
        >
          <div className="rounded-sm overflow-hidden border" style={{ borderColor: "#000" }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="uppercase text-[10px] tracking-wider border-b" style={{ borderColor: "#000" }}>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-center">Obtained</th>
                  <th className="px-3 py-2 text-center">Total</th>
                  <th className="px-3 py-2 text-center">%</th>
                  <th className="px-3 py-2 text-right">Grade</th>
                </tr>
              </thead>
              <tbody>
                {data.marks.map((m, idx) => {
                  const pct = m.totalMarks > 0 ? (m.marks / m.totalMarks) * 100 : 0;
                  return (
                    <tr key={`${m.subject}-${idx}`} className="border-b" style={{ borderColor: "#000" }}>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{m.subject}</div>
                        {m.examType ? (
                          <div className="text-[10px]" style={{ color: "#4b5563" }}>
                            {m.examType}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-center font-bold">{m.marks}</td>
                      <td className="px-3 py-2 text-center">{m.totalMarks}</td>
                      <td className="px-3 py-2 text-center font-semibold">{pct.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right font-bold">{m.grade || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t" style={{ borderColor: "#000" }}>
                  <td className="px-3 py-2 font-bold uppercase text-[10px]">Total</td>
                  <td className="px-3 py-2 text-center font-bold">{data.totalMarks}</td>
                  <td className="px-3 py-2 text-center font-bold">{data.totalMaxMarks}</td>
                  <td className="px-3 py-2 text-center font-bold">{data.overallScore.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right font-bold">{data.overallGrade}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </ParentPortalDocumentShell>
      </ParentPortalPdfMount>
    );
  }
);

MarksReportTemplate.displayName = "MarksReportTemplate";
export default MarksReportTemplate;
