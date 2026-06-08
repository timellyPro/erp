import React, { forwardRef } from "react";
import {
  ParentDocumentBrand,
  ParentPortalDocumentShell,
  ParentPortalPdfMount,
} from "./ParentPortalDocumentShell";

export interface AttendanceReportData {
  schoolName?: string;
  schoolLogo?: string | null;
  schoolAddress?: string;
  studentName: string;
  studentClass: string;
  admissionNumber?: string;
  academicYear?: string;
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
          documentTitle="Attendance Report"
          generatedAt={data.dateGenerated}
          student={{
            studentName: data.studentName,
            className: data.studentClass,
            admissionNumber: data.admissionNumber,
            academicYear: data.academicYear,
          }}
        >
          <div className="rounded-sm overflow-hidden border mb-4" style={{ borderColor: "#000" }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="uppercase text-[10px] tracking-wider border-b" style={{ borderColor: "#000" }}>
                  <th className="px-3 py-2 text-left">Metric</th>
                  <th className="px-3 py-2 text-right">Count</th>
                  <th className="px-3 py-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Present", value: data.summary.present, color: "#047857" },
                  { label: "Absent", value: data.summary.absent, color: "#b91c1c" },
                  { label: "Late", value: data.summary.late, color: "#c2410c" },
                  { label: "Total School Days", value: data.summary.total, color: "#111" },
                ].map((row) => (
                  <tr key={row.label} className="border-b" style={{ borderColor: "#000" }}>
                    <td className="px-3 py-2 font-semibold">{row.label}</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: row.color }}>
                      {row.value}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {data.summary.total > 0 && row.label !== "Total School Days"
                        ? `${((row.value / data.summary.total) * 100).toFixed(1)}%`
                        : row.label === "Total School Days"
                          ? "100%"
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="px-3 py-2 font-bold" colSpan={2}>
                    Overall Present Rate
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-lg">
                    {data.summary.presentRate.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[10px] text-center" style={{ color: "#4b5563" }}>
            This is an official computer-generated attendance summary.
          </p>
        </ParentPortalDocumentShell>
      </ParentPortalPdfMount>
    );
  }
);

AttendanceReportTemplate.displayName = "AttendanceReportTemplate";
export default AttendanceReportTemplate;
