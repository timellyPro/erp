/**
 * A4 class report cards — 2 students per page, B&W formal layout,
 * school logo in header + centered logo watermark (fee-receipt style).
 */
import { buildLogoWatermarkPng, loadSchoolLogoForPdf } from "@/lib/loadSchoolLogoForPdf";

export type ClassReportCardMark = {
  subject: string;
  marks: number;
  totalMarks: number;
  grade: string | null;
  examType?: string | null;
};

export type ClassReportCardStudent = {
  studentName: string;
  studentClass: string;
  admissionNumber?: string;
  rollNo?: string | null;
  overallScore: number;
  overallGrade: string;
  totalMarks: number;
  totalMaxMarks: number;
  marks: ClassReportCardMark[];
};

export type ClassReportCardsPdfInput = {
  schoolName: string;
  schoolAddress?: string;
  schoolLogoUrl?: string | null;
  examTypeLabel: string;
  subjectLabel: string;
  students: ClassReportCardStudent[];
  fileName?: string;
};

function drawHalfWatermark(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  watermarkPng: string | null,
  y0: number,
  halfH: number,
  pageW: number
) {
  if (!watermarkPng) return;
  const size = 62;
  try {
    doc.addImage(
      watermarkPng,
      "PNG",
      pageW / 2 - size / 2,
      y0 + halfH / 2 - size / 2,
      size,
      size
    );
  } catch {
    /* ignore */
  }
}

function drawHalfCard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  student: ClassReportCardStudent,
  schoolName: string,
  schoolAddress: string | undefined,
  examTypeLabel: string,
  subjectLabel: string,
  y0: number,
  halfH: number,
  logoPng: string | null,
  watermarkPng: string | null
) {
  const margin = 12;
  const pageW = 210;
  const contentW = pageW - margin * 2;
  const innerLeft = margin + 3;
  const innerRight = pageW - margin - 3;

  // Outer frame
  doc.setDrawColor(0);
  doc.setLineWidth(0.7);
  doc.rect(margin, y0 + 3, contentW, halfH - 6);
  doc.setLineWidth(0.25);
  doc.rect(margin + 1.2, y0 + 4.2, contentW - 2.4, halfH - 8.4);

  // Watermark behind content
  drawHalfWatermark(doc, watermarkPng, y0, halfH, pageW);

  let y = y0 + 9;

  // Header: logo + school identity
  const logoSize = 16;
  const hasLogo = !!logoPng;
  if (hasLogo && logoPng) {
    try {
      doc.addImage(logoPng, "PNG", margin + 3.5, y0 + 6.5, logoSize, logoSize);
    } catch {
      /* ignore */
    }
  }

  const textLeft = hasLogo ? margin + 3.5 + logoSize + 3 : margin + 4;
  const textWidth = pageW - textLeft - margin - 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  const nameLines = doc.splitTextToSize(schoolName || "School", textWidth) as string[];
  doc.text(nameLines.slice(0, 2), textLeft, y);
  y += Math.min(nameLines.length, 2) * 4.2;

  if (schoolAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(40);
    const addrLines = doc.splitTextToSize(schoolAddress, textWidth) as string[];
    doc.text(addrLines.slice(0, 2), textLeft, y);
    y += Math.min(addrLines.length, 2) * 3.2;
  }

  y = Math.max(y, y0 + (hasLogo ? 6.5 + logoSize : 14)) + 2;

  // Title band
  doc.setFillColor(0);
  doc.rect(margin + 2, y, contentW - 4, 6.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255);
  doc.text("ACADEMIC PERFORMANCE REPORT", pageW / 2, y + 4.4, { align: "center" });
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(0);
  doc.text(`${examTypeLabel}  ·  ${subjectLabel}`, pageW / 2, y, { align: "center" });
  y += 4;

  doc.setDrawColor(0);
  doc.setLineWidth(0.35);
  doc.line(innerLeft, y, innerRight, y);
  y += 4.5;

  // Student block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(student.studentName.toUpperCase(), innerLeft, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(
    `${student.overallScore.toFixed(1)}%  |  ${student.overallGrade}`,
    innerRight,
    y,
    { align: "right" }
  );
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const metaParts = [
    student.studentClass,
    student.rollNo ? `Roll No: ${student.rollNo}` : null,
    student.admissionNumber ? `Adm No: ${student.admissionNumber}` : null,
  ].filter(Boolean);
  doc.text(metaParts.join("   ·   "), innerLeft, y);
  y += 4.5;

  // Table
  const col = {
    subject: innerLeft,
    obtained: margin + 95,
    total: margin + 118,
    pct: margin + 141,
    grade: margin + 165,
  };

  doc.setFillColor(235);
  doc.rect(margin + 2, y - 3.2, contentW - 4, 5.2, "F");
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  doc.rect(margin + 2, y - 3.2, contentW - 4, 5.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(0);
  doc.text("SUBJECT", col.subject, y);
  doc.text("OBTAINED", col.obtained, y);
  doc.text("MAX", col.total, y);
  doc.text("%", col.pct, y);
  doc.text("GRADE", col.grade, y);
  y += 4.2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const bottomLimit = y0 + halfH - 16;
  const maxRows = Math.max(1, Math.floor((bottomLimit - y) / 4));
  const rows = student.marks.slice(0, maxRows);

  rows.forEach((m, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248);
      doc.rect(margin + 2, y - 2.8, contentW - 4, 4, "F");
    }
    const pct = m.totalMarks > 0 ? (m.marks / m.totalMarks) * 100 : 0;
    const subj =
      m.subject.length > 32 ? `${m.subject.slice(0, 30)}…` : m.subject;
    doc.setTextColor(0);
    doc.text(subj, col.subject, y);
    doc.text(String(m.grade === "AB" ? "AB" : m.marks), col.obtained, y);
    doc.text(String(m.totalMarks), col.total, y);
    doc.text(m.grade === "AB" ? "—" : `${pct.toFixed(0)}%`, col.pct, y);
    doc.text(m.grade || "—", col.grade, y);
    y += 4;
  });

  if (student.marks.length > rows.length) {
    doc.setFontSize(6);
    doc.setTextColor(60);
    doc.text(
      `+${student.marks.length - rows.length} more subject(s)`,
      col.subject,
      y
    );
    y += 3.5;
  }

  y = Math.min(Math.max(y + 1, y0 + halfH - 14), y0 + halfH - 12);
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(innerLeft, y, innerRight, y);
  y += 3.8;

  doc.setFillColor(0);
  doc.rect(margin + 2, y - 3, contentW - 4, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255);
  doc.text("TOTAL", col.subject, y);
  doc.text(String(student.totalMarks), col.obtained, y);
  doc.text(String(student.totalMaxMarks), col.total, y);
  doc.text(`${student.overallScore.toFixed(1)}%`, col.pct, y);
  doc.text(student.overallGrade, col.grade, y);

  // Footer note
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(80);
  doc.text(
    "Powered by Timelly",
    pageW / 2,
    y0 + halfH - 5,
    { align: "center" }
  );
  doc.setTextColor(0);
}

export async function downloadClassReportCardsTwoUpPdf(
  input: ClassReportCardsPdfInput
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageH = 297;
  const halfH = pageH / 2;
  const pageW = 210;
  const students = input.students;

  if (students.length === 0) {
    throw new Error("No students with marks to include");
  }

  const logoAssets = await loadSchoolLogoForPdf(
    { logoUrl: input.schoolLogoUrl },
    { fallbackToTimelly: true }
  );
  const logoPng = logoAssets?.png ?? null;
  // Stronger watermark for B&W print (fee-receipt style, centered in each half)
  const watermarkPng = logoPng
    ? (await buildLogoWatermarkPng(logoPng, 0.13, 520)) ||
      logoAssets?.watermarkPng ||
      null
    : null;

  for (let i = 0; i < students.length; i += 2) {
    if (i > 0) doc.addPage();

    // Clean white page
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, "F");

    drawHalfCard(
      doc,
      students[i],
      input.schoolName,
      input.schoolAddress,
      input.examTypeLabel,
      input.subjectLabel,
      0,
      halfH,
      logoPng,
      watermarkPng
    );

    // Scissor / cut guide
    doc.setDrawColor(120);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.setLineWidth(0.2);
    doc.line(10, halfH, 200, halfH);
    doc.setLineDashPattern([], 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(120);
    doc.text("✂ cut here", pageW / 2, halfH + 1.2, { align: "center" });
    doc.setTextColor(0);

    if (students[i + 1]) {
      drawHalfCard(
        doc,
        students[i + 1],
        input.schoolName,
        input.schoolAddress,
        input.examTypeLabel,
        input.subjectLabel,
        halfH,
        halfH,
        logoPng,
        watermarkPng
      );
    }
  }

  const fileName =
    input.fileName ||
    `Class_Reports_${input.examTypeLabel.replace(/\s+/g, "_")}_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
  doc.save(fileName);
}
