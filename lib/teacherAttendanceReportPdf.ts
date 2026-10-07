import jsPDF from "jspdf";
import { loadSchoolLogoForPdf, type SchoolLogoSource } from "@/lib/loadSchoolLogoForPdf";

export type TeacherAttendanceReportRow = {
  id: string;
  teacherId: string;
  name: string;
  subject: string;
  phone: string;
};

export type TeacherAttendanceSchoolInfo = SchoolLogoSource & {
  name?: string | null;
  address?: string | null;
  location?: string | null;
  affiliationLine?: string | null;
};

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

function statusShort(status: string): string {
  if (status === "PRESENT") return "P";
  if (status === "ABSENT") return "A";
  if (status === "LATE") return "L";
  if (status === "ON_LEAVE") return "OL";
  if (status === "-") return "-";
  return status.slice(0, 2);
}

function fitCellText(doc: jsPDF, text: string, maxWidth: number): string {
  const normalized = text.replace(/\s+/g, " ").trim() || "-";
  if (doc.getTextWidth(normalized) <= maxWidth) return normalized;
  const ellipsis = "...";
  let low = 0;
  let high = normalized.length;
  let best = "";
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${normalized.slice(0, mid)}${ellipsis}`;
    if (doc.getTextWidth(candidate) <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best || ellipsis;
}

export async function downloadTeacherAttendanceReportPdf(args: {
  filename: string;
  school: TeacherAttendanceSchoolInfo | null | undefined;
  periodStart: string;
  periodEnd: string;
  dates: string[];
  teachers: TeacherAttendanceReportRow[];
  byDate: Record<string, Record<string, string>>;
}): Promise<void> {
  if (args.teachers.length === 0) return;

  const logoAssets = await loadSchoolLogoForPdf(args.school);
  const schoolName = args.school?.name?.trim() || "School";
  const schoolAddress = [args.school?.address, args.school?.location, args.school?.affiliationLine]
    .filter((x) => typeof x === "string" && x.trim())
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();

  const useLandscape = args.dates.length > 14;
  const doc = new jsPDF({
    orientation: useLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const printableWidth = pageWidth - margin * 2;
  const rowHeight = 7;

  const fixedHeaders = ["TEACHER ID", "NAME", "SUBJECT", "PHONE"];
  const dayHeaders = args.dates.map((d) => d.slice(8));
  const headers = [...fixedHeaders, ...dayHeaders];

  const dayColWidth = args.dates.length > 20 ? 7 : args.dates.length > 14 ? 8 : 9;
  const fixedWidths = [22, 38, 28, 24];
  let columnWidths = [...fixedWidths, ...args.dates.map(() => dayColWidth)];
  const widthTotal = columnWidths.reduce((sum, w) => sum + w, 0);

  if (widthTotal < printableWidth) {
    const extra = printableWidth - widthTotal;
    columnWidths[1] += extra * 0.45;
    columnWidths[2] += extra * 0.35;
    columnWidths[0] += extra * 0.1;
    columnWidths[3] += extra * 0.1;
  } else if (widthTotal > printableWidth) {
    const scale = printableWidth / widthTotal;
    columnWidths = columnWidths.map((w) => w * scale);
  }

  const paintWhitePage = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.setTextColor(0, 0, 0);
    drawCenterLogoWatermark(doc, pageWidth, pageHeight, logoAssets?.watermarkPng ?? null);
  };

  const drawPageFrame = (isFirstPage: boolean) => {
    paintWhitePage();

    if (isFirstPage) {
      const logoSize = 20;
      const headerTop = 6;
      const logoGap = 5;

      if (logoAssets?.png) {
        try {
          doc.addImage(logoAssets.png, "PNG", margin, headerTop, logoSize, logoSize);
        } catch {
          /* ignore invalid image */
        }
      }

      const textX = logoAssets?.png ? margin + logoSize + logoGap : margin;
      const textW = pageWidth - margin - textX;
      let textY = headerTop + 6;

      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const nameLines = (doc.splitTextToSize(schoolName, textW) as string[]) || [schoolName];
      doc.text(nameLines, textX, textY);
      textY += nameLines.length * 5.2 + 1.5;

      if (schoolAddress) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const addressLines = (doc.splitTextToSize(schoolAddress, textW) as string[]) || [];
        doc.text(addressLines.slice(0, 3), textX, textY);
        textY += Math.min(addressLines.length, 3) * 3.6;
      }

      const blockBottom = Math.max(
        headerTop + (logoAssets?.png ? logoSize : 0),
        textY
      );
      const titleY = blockBottom + 5;

      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Teacher Attendance Report", pageWidth / 2, titleY, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(
        `Period: ${args.periodStart} to ${args.periodEnd}`,
        pageWidth / 2,
        titleY + 6,
        { align: "center" }
      );

      const bandBottom = titleY + 12;
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, bandBottom, pageWidth - margin, bandBottom);

      const tableY = bandBottom + 4;
      doc.setFillColor(230, 236, 248);
      doc.rect(margin, tableY, printableWidth, 8.5, "F");
      doc.setDrawColor(196, 208, 229);
      doc.rect(margin, tableY, printableWidth, pageHeight - tableY - 12);

      let x = margin;
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      headers.forEach((label, idx) => {
        const width = columnWidths[idx];
        const clipped = fitCellText(doc, label, Math.max(6, width - 2));
        doc.text(clipped, x + 2, tableY + 5.6);
        x += width;
      });

      return tableY + 12;
    }

    const tableY = 10;
    doc.setFillColor(230, 236, 248);
    doc.rect(margin, tableY, printableWidth, 8.5, "F");
    doc.setDrawColor(196, 208, 229);
    doc.rect(margin, tableY, printableWidth, pageHeight - tableY - 12);

    let x = margin;
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    headers.forEach((label, idx) => {
      const width = columnWidths[idx];
      const clipped = fitCellText(doc, label, Math.max(6, width - 2));
      doc.text(clipped, x + 2, tableY + 5.6);
      x += width;
    });

    return tableY + 12;
  };

  let y = drawPageFrame(true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  args.teachers.forEach((teacher, rowIndex) => {
    const dayStatuses = args.dates.map((date) =>
      statusShort(args.byDate[date]?.[teacher.id] || "-")
    );
    const rowValues = [
      teacher.teacherId,
      teacher.name,
      teacher.subject,
      teacher.phone,
      ...dayStatuses,
    ];

    if (y + rowHeight > pageHeight - 14) {
      doc.addPage();
      y = drawPageFrame(false);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
    }

    const rowTop = y - 5.4;
    if (rowIndex % 2 === 0) {
      doc.setFillColor(245, 248, 255);
      doc.rect(margin + 0.2, rowTop, printableWidth - 0.4, rowHeight, "F");
    }

    let x = margin;
    rowValues.forEach((value, idx) => {
      const width = columnWidths[idx];
      const clipped = fitCellText(doc, String(value ?? "-"), Math.max(6, width - 4));
      doc.setTextColor(39, 51, 79);
      doc.text(clipped, x + 2, y);
      x += width;
    });
    y += rowHeight;
  });

  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth - margin, pageHeight - 5.2, {
    align: "right",
  });

  doc.save(args.filename);
}
