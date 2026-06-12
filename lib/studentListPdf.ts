import jsPDF from "jspdf";
import type { StudentRow } from "@/app/frontend/components/schooladmin/students/types";
import { getAge } from "@/app/frontend/components/schooladmin/students/utils";
import { formatResidencyTypeForDisplay } from "@/lib/residencyDisplay";
import { loadSchoolLogoForPdf, type SchoolLogoSource } from "@/lib/loadSchoolLogoForPdf";

type SchoolInfo = SchoolLogoSource & {
  name?: string | null;
  address?: string | null;
  location?: string | null;
  affiliationLine?: string | null;
};

type ExportArgs = {
  students: StudentRow[];
  title: string;
  subtitle?: string;
  filename?: string;
  school?: SchoolInfo | null;
};

const ACCENT: [number, number, number] = [15, 118, 110];
const HEADER_BG: [number, number, number] = [30, 41, 59];
const ROW_ALT: [number, number, number] = [248, 250, 252];
const BORDER: [number, number, number] = [226, 232, 240];

function drawCenterLogoWatermark(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  watermarkPng: string | null
) {
  if (!watermarkPng) return;
  const size = 95;
  try {
    doc.addImage(
      watermarkPng,
      "PNG",
      pageW / 2 - size / 2,
      pageH / 2 - size / 2,
      size,
      size
    );
  } catch {
    /* ignore */
  }
}

function drawHeaderLogoLeft(
  doc: jsPDF,
  margin: number,
  y: number,
  logoPng: string,
  logoSize: number
): void {
  try {
    doc.addImage(logoPng, "PNG", margin, y, logoSize, logoSize);
  } catch {
    /* ignore */
  }
}

function drawPageFooter(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  margin: number,
  pageNum: number,
  total: number
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("Confidential — school student roster", margin, pageH - 8);
  doc.text(`Page ${pageNum} of ${total}`, pageW - margin, pageH - 8, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

export async function downloadStudentListPdf({
  students,
  title,
  subtitle,
  filename = "students-list.pdf",
  school,
}: ExportArgs): Promise<void> {
  const logoAssets = await loadSchoolLogoForPdf(school);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  const schoolName = school?.name?.trim() || "School";
  const addr = [school?.address, school?.location, school?.affiliationLine]
    .filter((x) => typeof x === "string" && x.trim())
    .join(", ");

  const headers = ["#", "Student ID", "Name", "Gender", "Age", "Class", "Type", "Status"];
  const colRatios = [0.05, 0.12, 0.22, 0.1, 0.07, 0.14, 0.14, 0.16];
  const colWidths = colRatios.map((r) => r * contentW);
  const rowH = 8;
  const headerRowH = 9;

  let pageNum = 1;
  const totalPagesEstimate = Math.max(
    1,
    Math.ceil((students.length * rowH + 80) / (pageH - margin * 2 - 50))
  );

  const paintPageBackground = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, "F");
    drawCenterLogoWatermark(doc, pageW, pageH, logoAssets?.watermarkPng ?? null);
  };

  const drawFirstPageHeader = (): number => {
    paintPageBackground();

    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, pageW, 4, "F");

    const headerTop = 10;
    const logoSize = 22;
    const logoGap = 5;
    const textX = logoAssets?.png ? margin + logoSize + logoGap : margin;
    const textW = pageW - margin - textX;
    let textY = headerTop + 6;

    if (logoAssets?.png) {
      drawHeaderLogoLeft(doc, margin, headerTop, logoAssets.png, logoSize);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...HEADER_BG);
    const nameLines = doc.splitTextToSize(schoolName, textW) as string[];
    doc.text(nameLines, textX, textY);
    textY += nameLines.length * 5.2 + 1.5;

    if (addr) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const addrLines = doc.splitTextToSize(addr, textW) as string[];
      doc.text(addrLines.slice(0, 3), textX, textY);
      textY += Math.min(addrLines.length, 3) * 3.6;
    }

    const blockBottom = Math.max(
      headerTop + (logoAssets?.png ? logoSize : 0),
      textY
    );
    let y = blockBottom + 5;

    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...HEADER_BG);
    doc.text(title, margin, y);

    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitle, pageW - margin, y, { align: "right" });
    }
    y += 5;

    doc.setFontSize(8);
    doc.text(
      `${students.length} student${students.length === 1 ? "" : "s"} · Generated ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
      margin,
      y
    );
    y += 8;

    doc.setTextColor(0, 0, 0);
    return y;
  };

  const drawContinuationTop = (): number => {
    paintPageBackground();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${schoolName} — ${title} (continued)`, margin, 12);
    doc.setTextColor(0, 0, 0);
    return 16;
  };

  const drawTableHeader = (y: number) => {
    doc.setFillColor(...HEADER_BG);
    doc.roundedRect(margin, y, contentW, headerRowH, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    let x = margin + 2;
    headers.forEach((label, i) => {
      const w = colWidths[i];
      const lines = doc.splitTextToSize(label, w - 3) as string[];
      doc.text(lines[0] || label, x + 1, y + 5.8);
      x += w;
    });
    doc.setTextColor(0, 0, 0);
    return y + headerRowH + 1;
  };

  const drawCell = (text: string, x: number, y: number, w: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(text || "—", w - 3) as string[];
    doc.text(lines[0] || "—", x + 1.5, y + 5.5);
  };

  let y = drawFirstPageHeader();
  y = drawTableHeader(y);
  const tableTop = y - headerRowH - 1;
  let rowIndex = 0;

  students.forEach((student, index) => {
    if (y + rowH > pageH - margin - 12) {
      drawPageFooter(doc, pageW, pageH, margin, pageNum, totalPagesEstimate);
      doc.addPage();
      pageNum += 1;
      y = drawContinuationTop();
      y = drawTableHeader(y);
      rowIndex = 0;
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(margin, y, contentW, rowH, "F");
    }

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.1);
    doc.line(margin, y + rowH, pageW - margin, y + rowH);

    const name = student.user?.name || student.name || "—";
    const classLabel = student.class
      ? `${student.class.name}${student.class.section ? `-${student.class.section}` : ""}`
      : "—";
    const residency = formatResidencyTypeForDisplay(student.residencyType || "Day Scholar");
    const cells = [
      String(index + 1),
      student.rollNo || student.admissionNumber || "—",
      name,
      student.gender || "—",
      getAge(student.dob),
      classLabel,
      residency,
      student.status || "Active",
    ];

    let x = margin + 2;
    cells.forEach((cell, i) => {
      drawCell(cell, x, y, colWidths[i], i === 2);
      x += colWidths[i];
    });

    y += rowH;
    rowIndex += 1;
  });

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.4);
  doc.line(margin, tableTop, margin, y);
  doc.line(pageW - margin, tableTop, pageW - margin, y);
  doc.line(margin, y, pageW - margin, y);

  drawPageFooter(doc, pageW, pageH, margin, pageNum, pageNum);
  doc.save(filename);
}
