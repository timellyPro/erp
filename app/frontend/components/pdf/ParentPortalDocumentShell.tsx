import React, { forwardRef } from "react";
import { format } from "date-fns";

export type ParentDocumentBrand = {
  schoolName: string;
  schoolLogo?: string | null;
  schoolAddress?: string;
};

export type ParentDocumentStudentBlock = {
  studentName: string;
  className?: string;
  admissionNumber?: string;
  academicYear?: string;
  leftRows?: Array<{ label: string; value: string }>;
  rightRows?: Array<{ label: string; value: string }>;
};

type ParentPortalDocumentShellProps = {
  brand: ParentDocumentBrand;
  documentTitle: string;
  /** Pre-formatted "Generated on" label (dd-MM-yyyy at print time). */
  generatedOn?: string;
  /** @deprecated Prefer generatedOn */
  generatedAt?: string | Date;
  student?: ParentDocumentStudentBlock;
  children: React.ReactNode;
  minHeight?: number;
};

export function ParentPortalDocumentShell({
  brand,
  documentTitle,
  generatedOn,
  generatedAt,
  student,
  children,
  minHeight = 720,
}: ParentPortalDocumentShellProps) {
  const formattedDate =
    generatedOn?.trim() ||
    (generatedAt != null ? format(new Date(generatedAt), "dd-MM-yyyy") : format(new Date(), "dd-MM-yyyy"));

  return (
    <div
      className="p-6 pb-14 font-sans flex flex-col relative"
      style={{
        width: "800px",
        minHeight,
        backgroundColor: "#ffffff",
        color: "#000000",
        boxSizing: "border-box",
      }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: 0.06 }}
      >
        <img
          src={brand.schoolLogo || "/timelylogo.webp"}
          alt=""
          className="w-52 h-52 object-contain"
        />
      </div>

      <div className="relative z-10 border-b pb-2 mb-4" style={{ borderColor: "#000" }}>
        <div className="flex items-center justify-center gap-3">
          {brand.schoolLogo ? (
            <img
              src={brand.schoolLogo}
              alt="School logo"
              className="w-12 h-12 object-contain rounded-full border"
              style={{ borderColor: "#000" }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full border flex items-center justify-center text-[9px] font-bold"
              style={{ borderColor: "#000" }}
            >
              LOGO
            </div>
          )}
          <div className="text-center">
            <h1 className="text-[26px] font-bold leading-tight tracking-wide">
              {brand.schoolName || "School"}
            </h1>
            <p className="text-xs leading-tight mt-0.5">{brand.schoolAddress || "-"}</p>
            <h2 className="text-sm font-semibold mt-1 uppercase tracking-wide">{documentTitle}</h2>
            <p className="text-[10px] mt-0.5" style={{ color: "#4b5563" }}>
              Generated on: {formattedDate}
            </p>
          </div>
        </div>
      </div>

      {student ? (
        <div className="relative z-10 grid grid-cols-2 gap-6 mb-4 text-xs">
          <div className="space-y-1">
            <div className="font-semibold text-sm mb-1">Student Details</div>
            <div>
              <span className="font-semibold">Name:</span> {student.studentName}
            </div>
            {student.className ? (
              <div>
                <span className="font-semibold">Class:</span> {student.className}
              </div>
            ) : null}
            {student.admissionNumber ? (
              <div>
                <span className="font-semibold">Admission No.:</span> {student.admissionNumber}
              </div>
            ) : null}
            {student.academicYear ? (
              <div>
                <span className="font-semibold">Academic Year:</span> {student.academicYear}
              </div>
            ) : null}
            {student.leftRows?.map((row) => (
              <div key={row.label}>
                <span className="font-semibold">{row.label}:</span> {row.value}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {student.rightRows?.map((row) => (
              <div key={row.label}>
                <span className="font-semibold">{row.label}:</span> {row.value}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex-1">{children}</div>

      <div
        className="absolute bottom-2 left-0 right-0 text-center text-[11px] z-10"
        style={{ fontWeight: 400 }}
      >
        Powered by Timelly
      </div>
    </div>
  );
}

/** Hidden PDF mount — ref on this element directly (no portal) for reliable html2canvas capture. */
export const ParentPortalPdfMount = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function ParentPortalPdfMount({ children }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "800px",
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    );
  }
);
ParentPortalPdfMount.displayName = "ParentPortalPdfMount";
