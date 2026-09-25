import jsPDF from "jspdf";
import { loadSchoolLogoForPdf, type SchoolLogoSource } from "@/lib/loadSchoolLogoForPdf";

export type ConsolidatedMarksPdfStudent = {
  name: string;
  section?: string | null;
  subjectMarks: Record<string, number | "AB" | null>;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  rank: number;
};

export type ConsolidatedMarksPdfSheet = {
  label: string;
  includeSectionCol?: boolean;
  subjects: string[];
  students: ConsolidatedMarksPdfStudent[];
};

export type ConsolidatedMarksPdfPayload = {
  school: SchoolLogoSource & { name: string; address?: string };
  examType: string;
  sheets: ConsolidatedMarksPdfSheet[];
};

const HEADER_BG: [number, number, number] = [232, 245, 200];
const BORDER: [number, number, number] = [0, 0, 0];
const ROW_ALT: [number, number, number] = [250, 252, 250];

function fitCellText(doc: jsPDF, text: string, maxWidth: number): string {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim() || "";
  if (!normalized) return "";
  if (doc.getTextWidth(normalized) <= maxWidth) return normalized;
  const ellipsis = "…";
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

function formatMark(v: number | "AB" | null | undefined): string {
  if (v === "AB") return "AB";
  if (v === null || v === undefined) return "";
  return String(v);
}

function drawCenterLogoWatermark(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  watermarkPng: string | null
) {
  if (!watermarkPng) return;
  const size = 90;
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

function renderSheet(
  doc: jsPDF,
  args: {
    schoolName: string;
    schoolAddress: string;
    examLabel: string;
    sheet: ConsolidatedMarksPdfSheet;
    logoPng: string | null;
    watermarkPng: string | null;
    startNewDoc: boolean;
  }
): void {
  const { sheet, schoolName, schoolAddress, examLabel, logoPng, watermarkPng, startNewDoc } = args;
  const subjects = sheet.subjects ?? [];
  const showSection = Boolean(sheet.includeSectionCol);
  const colCount = 2 + (showSection ? 1 : 0) + subjects.length + 4;
  const useLandscape = colCount > 10;
  const orientation = useLandscape ? "landscape" : "portrait";

  if (startNewDoc) {
    doc.setProperties({ title: `${examLabel} — ${sheet.label}` });
  } else {
    doc.addPage(orientation);
  }

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const printableW = pageW - margin * 2;
  const rowH = 6.5;
  const headerRowH = 8;

  const headers = [
    "S.NO",
    "NAME OF THE STUDENT",
    ...(showSection ? ["SECTION"] : []),
    ...subjects,
    "TOTAL",
    "%",
    "GRADE",
    "RANK",
  ];

  const fixedWidths = [10, 38, ...(showSection ? [14] : []), 12, 12, 10, 8];
  const subjectCount = subjects.length;
  const fixedTotal = fixedWidths.reduce((s, w) => s + w, 0);
  const subjectColW =
    subjectCount > 0 ? Math.max(8, (printableW - fixedTotal) / subjectCount) : 0;
  const colWidths = [
    fixedWidths[0]!,
    fixedWidths[1]!,
    ...(showSection ? [fixedWidths[2]!] : []),
    ...subjects.map(() => subjectColW),
    ...fixedWidths.slice(showSection ? 3 : 2),
  ];
  const widthSum = colWidths.reduce((s, w) => s + w, 0);
  if (widthSum > printableW) {
    const scale = printableW / widthSum;
    for (let i = 0; i < colWidths.length; i++) colWidths[i] = colWidths[i]! * scale;
  }

  let y = margin;

  const paintPage = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, "F");
    drawCenterLogoWatermark(doc, pageW, pageH, watermarkPng);
  };

  const drawTitleBlock = () => {
    paintPage();
    y = margin;

    const logoSize = 20;
    const logoGap = 5;
    if (logoPng) {
      try {
        doc.addImage(logoPng, "PNG", margin, y, logoSize, logoSize);
      } catch {
        /* ignore */
      }
    }

    const textX = logoPng ? margin + logoSize + logoGap : margin;
    const textW = printableW - (textX - margin);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(schoolName.toUpperCase(), textX, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (schoolAddress) {
      doc.text(fitCellText(doc, schoolAddress, textW), textX, y + 12);
    }

    y += Math.max(logoPng ? logoSize : 0, schoolAddress ? 16 : 12) + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      fitCellText(
        doc,
        `CONSOLIDATED MARKS LIST — ${examLabel}        CLASS: ${sheet.label}`,
        printableW
      ),
      margin,
      y
    );
    y += 6;
  };

  const drawTableHeader = () => {
    doc.setFillColor(...HEADER_BG);
    doc.setDrawColor(...BORDER);
    doc.rect(margin, y, printableW, headerRowH, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);

    let x = margin;
    for (let i = 0; i < headers.length; i++) {
      const w = colWidths[i] ?? 10;
      const label = fitCellText(doc, headers[i]!, w - 2);
      doc.text(label, x + w / 2, y + headerRowH / 2 + 2, { align: "center" });
      x += w;
    }
    y += headerRowH;
  };

  drawTitleBlock();
  drawTableHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  for (let rowIdx = 0; rowIdx < sheet.students.length; rowIdx++) {
    const stu = sheet.students[rowIdx]!;
    if (y + rowH > pageH - margin) {
      doc.addPage(orientation);
      paintPage();
      y = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`${sheet.label} (continued)`, margin, y + 4);
      y += 8;
      drawTableHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
    }

    if (rowIdx % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(margin, y, printableW, rowH, "F");
    }

    doc.setDrawColor(...BORDER);
    doc.rect(margin, y, printableW, rowH, "S");

    const values: string[] = [
      String(rowIdx + 1),
      stu.name,
      ...(showSection ? [stu.section ?? ""] : []),
      ...subjects.map((sub) => formatMark(stu.subjectMarks?.[sub])),
      stu.totalMax > 0 ? String(stu.totalObtained) : "",
      stu.totalMax > 0 ? String(stu.percentage) : "",
      stu.totalMax > 0 ? stu.grade : "",
      stu.totalMax > 0 ? String(stu.rank) : "",
    ];

    let x = margin;
    for (let i = 0; i < values.length; i++) {
      const w = colWidths[i] ?? 10;
      const align = i === 1 ? "left" : "center";
      const pad = i === 1 ? 1.5 : 0;
      doc.text(fitCellText(doc, values[i]!, w - pad * 2), x + (align === "left" ? pad : w / 2), y + rowH / 2 + 2, {
        align,
      });
      x += w;
    }
    y += rowH;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`${schoolName} • ${new Date().toLocaleDateString("en-IN")}`, margin, pageH - 6);
  doc.setTextColor(0, 0, 0);
}

export async function downloadConsolidatedMarksPdf(
  data: ConsolidatedMarksPdfPayload,
  filename: string
): Promise<void> {
  const sheets = data.sheets ?? [];
  if (sheets.length === 0) throw new Error("No class sheets to export");

  const logoAssets = await loadSchoolLogoForPdf(data.school, { fallbackToTimelly: false });

  const schoolName = data.school?.name?.trim() || "School";
  const schoolAddress = data.school?.address?.trim() ?? "";
  const examLabel =
    data.examType && data.examType !== "ALL" ? data.examType : "ALL EXAMS";

  const firstSheet = sheets[0]!;
  const firstColCount =
    2 + (firstSheet.includeSectionCol ? 1 : 0) + (firstSheet.subjects?.length ?? 0) + 4;
  const doc = new jsPDF({
    orientation: firstColCount > 10 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  sheets.forEach((sheet, idx) => {
    renderSheet(doc, {
      schoolName,
      schoolAddress,
      examLabel,
      sheet,
      logoPng: logoAssets?.png ?? null,
      watermarkPng: logoAssets?.watermarkPng ?? null,
      startNewDoc: idx === 0,
    });
  });

  doc.save(filename);
}
