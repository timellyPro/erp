import jsPDF from "jspdf";
import { loadLogoForServerPdf, loadTimellyFallbackLogo, pdfLogoDataUri, type PdfLogoAsset } from "@/lib/serverPdfLogo";
import { studentToDetailsExportRow } from "@/lib/studentDetailsExport";

type ExportStudent = Parameters<typeof studentToDetailsExportRow>[0];

export type StudentDetailsPdfSchool = {
  name?: string | null;
  address?: string | null;
  location?: string | null;
  logoUrl?: string | null;
  adminPhotoUrl?: string | null;
};

const PDF_COLUMNS = [
  "S.no",
  "Adm. No",
  "Student Name",
  "Class",
  "Gender",
  "Father",
  "Mobile",
  "Status",
] as const;

const PDF_COLUMN_INDICES = [0, 2, 3, 4, 5, 17, 7, 24] as const;

const ACCENT: [number, number, number] = [15, 118, 110];
const HEADER_BG: [number, number, number] = [30, 41, 59];
const ROW_ALT: [number, number, number] = [248, 250, 252];
const BORDER: [number, number, number] = [226, 232, 240];

function pickPdfColumns(row: (string | number)[]): string[] {
  return PDF_COLUMN_INDICES.map((idx) => String(row[idx] ?? ""));
}

function addLogoImage(
  doc: jsPDF,
  logo: PdfLogoAsset,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const uri = pdfLogoDataUri(logo);
  try {
    doc.addImage(uri, logo.format, x, y, w, h);
    return true;
  } catch {
    try {
      doc.addImage(uri, "PNG", x, y, w, h);
      return true;
    } catch {
      return false;
    }
  }
}

function drawCenterLogoWatermark(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  logo: PdfLogoAsset | null
) {
  if (!logo) return;
  const size = 78;
  try {
    const gState = new (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState({
      opacity: 0.07,
    });
    doc.saveGraphicsState();
    doc.setGState(gState as never);
    addLogoImage(doc, logo, pageW / 2 - size / 2, pageH / 2 - size / 2, size, size);
    doc.restoreGraphicsState();
  } catch {
    /* ignore watermark failures */
  }
}

function drawPdfCell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right" = "left"
) {
  const pad = 1.5;
  const maxW = Math.max(4, width - pad * 2);
  const value = String(text ?? "").trim() || "-";
  const baseSize = doc.getFontSize();
  let size = baseSize;
  const minSize = 5.5;

  while (size > minSize && doc.getTextWidth(value) > maxW) {
    size -= 0.25;
    doc.setFontSize(size);
  }

  let display = value;
  if (doc.getTextWidth(display) > maxW) {
    const ellipsis = "…";
    let low = 0;
    let high = display.length;
    let best = ellipsis;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${display.slice(0, mid)}${ellipsis}`;
      if (doc.getTextWidth(candidate) <= maxW) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    display = best;
  }

  const textX = align === "right" ? x + width - pad : x + pad;
  doc.text(display, textX, y, align === "right" ? { align: "right" } : undefined);
  doc.setFontSize(baseSize);
}

export async function buildStudentDetailsPdfBuffer(args: {
  students: ExportStudent[];
  title?: string;
  school?: StudentDetailsPdfSchool | null;
  origin: string;
}): Promise<Buffer> {
  const title = args.title ?? "Student Details Report";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;

  const schoolName = args.school?.name?.trim() || "School";
  const addr = [args.school?.address, args.school?.location]
    .filter((x) => typeof x === "string" && x.trim())
    .join(", ");

  const headerLogo =
    (await loadLogoForServerPdf(
      args.school?.logoUrl,
      args.origin,
      args.school?.adminPhotoUrl
    )) ?? (await loadTimellyFallbackLogo());

  const colRatios = [0.06, 0.14, 0.22, 0.1, 0.1, 0.16, 0.12, 0.1];
  const colWidths = colRatios.map((r) => r * contentW);
  const headerRowH = 8;
  const rowH = 7.5;

  const rows = args.students.map((s, i) =>
    pickPdfColumns(studentToDetailsExportRow(s, i + 1))
  );

  const paintPage = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, "F");
    drawCenterLogoWatermark(doc, pageW, pageH, headerLogo);
  };

  const drawFirstPageHeader = (): number => {
    paintPage();

    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, pageW, 3.5, "F");

    const headerTop = 10;
    const logoSize = 20;
    const logoGap = 4;
    const textX = headerLogo ? margin + logoSize + logoGap : margin;
    const textW = pageW - margin - textX;
    let textY = headerTop + 5;

    if (headerLogo) {
      addLogoImage(doc, headerLogo, margin, headerTop, logoSize, logoSize);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...HEADER_BG);
    const nameLines = doc.splitTextToSize(schoolName, textW) as string[];
    doc.text(nameLines, textX, textY);
    textY += nameLines.length * 5 + 1;

    if (addr) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const addrLines = doc.splitTextToSize(addr, textW) as string[];
      doc.text(addrLines.slice(0, 3), textX, textY);
      textY += Math.min(addrLines.length, 3) * 3.4;
    }

    const blockBottom = Math.max(headerTop + (headerLogo ? logoSize : 0), textY);
    let y = blockBottom + 4;

    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...HEADER_BG);
    doc.text(title, margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const dateLabel = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    doc.text(`${dateLabel} · ${rows.length} student${rows.length === 1 ? "" : "s"}`, pageW - margin, y, {
      align: "right",
    });
    y += 7;

    doc.setTextColor(0, 0, 0);
    return y;
  };

  const drawTableHeader = (y: number): number => {
    doc.setFillColor(...HEADER_BG);
    doc.rect(margin, y, contentW, headerRowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);

    let x = margin;
    PDF_COLUMNS.forEach((label, i) => {
      drawPdfCell(doc, label, x, y + 5.5, colWidths[i]);
      x += colWidths[i];
    });

    doc.setTextColor(0, 0, 0);
    return y + headerRowH;
  };

  const drawContinuationHeader = (): number => {
    paintPage();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${schoolName} — ${title}`, margin, 14);
    doc.setTextColor(0, 0, 0);
    return drawTableHeader(18);
  };

  let y = drawFirstPageHeader();
  y = drawTableHeader(y);

  rows.forEach((row, rowIdx) => {
    if (y + rowH > pageH - 14) {
      doc.addPage();
      y = drawContinuationHeader();
    }

    if (rowIdx % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(margin, y, contentW, rowH, "F");
    }

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.rect(margin, y, contentW, rowH, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(30, 41, 59);

    let x = margin;
    row.forEach((cell, colIdx) => {
      drawPdfCell(doc, cell, x, y + 5, colWidths[colIdx]);
      x += colWidths[colIdx];
    });

    y += rowH;
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Powered by Timelly", margin, pageH - 7);
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 7, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
