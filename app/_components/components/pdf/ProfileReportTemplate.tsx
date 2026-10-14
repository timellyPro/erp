import React, { forwardRef } from "react";
import {
  ParentDocumentBrand,
  ParentPortalDocumentShell,
  ParentPortalPdfMount,
} from "./ParentPortalDocumentShell";

export interface ProfileReportData {
  schoolName?: string;
  schoolLogo?: string | null;
  schoolAddress?: string;
  dateGenerated: string | Date;
  studentName: string;
  admissionNumber?: string;
  className?: string;
  rollNo?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  phone?: string;
  email?: string;
  academicYear?: string;
  stats: Array<{ label: string; value: string }>;
  attendanceTrends: Array<{ month: string; present: number; total: number; pct: number }>;
  academicPerformance: Array<{ subject: string; score: number }>;
  certificates: Array<{ title: string; issuedDate: string }>;
}

type Props = { data: ProfileReportData | null };

const ProfileReportTemplate = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  if (!data) return null;

  const brand: ParentDocumentBrand = {
    schoolName: data.schoolName || "School",
    schoolLogo: data.schoolLogo,
    schoolAddress: data.schoolAddress,
  };

  return (
    <ParentPortalPdfMount ref={ref}>
      <ParentPortalDocumentShell
        brand={brand}
        documentTitle="Student Profile Report"
        generatedAt={data.dateGenerated}
        student={{
          studentName: data.studentName,
          className: data.className,
          admissionNumber: data.admissionNumber,
          academicYear: data.academicYear,
          leftRows: [
            { label: "Roll No.", value: data.rollNo || "—" },
            { label: "DOB", value: data.dob || "—" },
            { label: "Father", value: data.fatherName || "—" },
          ],
          rightRows: [
            { label: "Mother", value: data.motherName || "—" },
            { label: "Phone", value: data.phone || "—" },
            { label: "Email", value: data.email || "—" },
          ],
        }}
        minHeight={900}
      >
        {data.stats.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {data.stats.map((s) => (
              <div
                key={s.label}
                className="border rounded-sm px-3 py-2 text-center"
                style={{ borderColor: "#000" }}
              >
                <p className="text-[10px] uppercase tracking-wide" style={{ color: "#4b5563" }}>
                  {s.label}
                </p>
                <p className="text-sm font-bold mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {data.academicPerformance.length > 0 ? (
          <div className="mb-4">
            <p className="text-xs font-bold mb-2 uppercase tracking-wide">Academic Performance</p>
            <div className="rounded-sm overflow-hidden border" style={{ borderColor: "#000" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b uppercase text-[10px]" style={{ borderColor: "#000" }}>
                    <th className="px-3 py-2 text-left">Subject</th>
                    <th className="px-3 py-2 text-right">Score %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.academicPerformance.map((a) => (
                    <tr key={a.subject} className="border-b" style={{ borderColor: "#000" }}>
                      <td className="px-3 py-2">{a.subject}</td>
                      <td className="px-3 py-2 text-right font-bold">{a.score}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {data.attendanceTrends.length > 0 ? (
          <div className="mb-4">
            <p className="text-xs font-bold mb-2 uppercase tracking-wide">Attendance Summary</p>
            <div className="rounded-sm overflow-hidden border" style={{ borderColor: "#000" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b uppercase text-[10px]" style={{ borderColor: "#000" }}>
                    <th className="px-3 py-2 text-left">Month</th>
                    <th className="px-3 py-2 text-center">Present</th>
                    <th className="px-3 py-2 text-center">Total</th>
                    <th className="px-3 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attendanceTrends.map((t) => (
                    <tr key={t.month} className="border-b" style={{ borderColor: "#000" }}>
                      <td className="px-3 py-2">{t.month}</td>
                      <td className="px-3 py-2 text-center">{t.present}</td>
                      <td className="px-3 py-2 text-center">{t.total}</td>
                      <td className="px-3 py-2 text-right font-semibold">{t.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {data.certificates.length > 0 ? (
          <div>
            <p className="text-xs font-bold mb-2 uppercase tracking-wide">Certificates</p>
            <div className="rounded-sm overflow-hidden border" style={{ borderColor: "#000" }}>
              <table className="w-full text-xs">
                <tbody>
                  {data.certificates.map((c) => (
                    <tr key={c.title} className="border-b" style={{ borderColor: "#000" }}>
                      <td className="px-3 py-2">{c.title}</td>
                      <td className="px-3 py-2 text-right">{c.issuedDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </ParentPortalDocumentShell>
    </ParentPortalPdfMount>
  );
});

ProfileReportTemplate.displayName = "ProfileReportTemplate";
export default ProfileReportTemplate;
