import jsPDF from "jspdf";
import {
  fetchSchoolMeta,
  formatReportYmd,
  formatSummaryPeriod,
  type Bucket,
  type GroupMode,
  type ReportPayload,
} from "./admissionFeeReportTypes";
import {
  loadImageAsDataUrl,
  formatInrPdf,
  formatPaymentModePdf,
  formatPaymentMethodPdf,
  columnWidths,
  type PdfAlign,
  type Rgb,
} from "./admissionFeeReportPdfHelpers";

/** Premium PDF export: branded header, KPI cards, tables with zebra rows & pagination. */
export async function exportAdmissionFeeReportPdf(
  data: ReportPayload,
  groupMode: GroupMode,
  buckets: Bucket[]
): Promise<void> {
  const school = await fetchSchoolMeta();
  const logoDataUrl = school.logoUrl ? await loadImageAsDataUrl(school.logoUrl) : null;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const m = 12;
  const contentW = W - m * 2;
  let page = 1;

  const line = [226, 232, 240] as [number, number, number];
  const text = [30, 41, 59] as [number, number, number];
  const muted = [100, 116, 139] as [number, number, number];

  const drawPageBackground = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, "F");
  };

  const periodLabel = `${formatReportYmd(data.from)} – ${formatReportYmd(data.to)}`;

  const drawHeroHeader = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, 38, "F");
    doc.setDrawColor(...line);
    doc.line(m, 38, W - m, 38);

    const logoSize = 16;
    if (logoDataUrl) {
      const fmt = logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      try {
        doc.addImage(logoDataUrl, fmt, m, 10, logoSize, logoSize);
      } catch {
        /* ignore */
      }
    }
    const titleX = logoDataUrl ? m + logoSize + 4 : m;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(school.name, titleX, 15);
    doc.setFontSize(16);
    doc.text("Admission Fee Collection Report", titleX, 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    const viewLabel = groupMode === "day" ? "Date-wise summary" : "Month-wise summary";
    doc.text(periodLabel, W - m, 14, { align: "right" });
    doc.text(viewLabel, W - m, 21, { align: "right" });
    doc.setFontSize(8);
    doc.text(
      `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
      W - m,
      31,
      { align: "right" }
    );
  };

  const drawContinuationHeader = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, 14, "F");
    doc.setDrawColor(...line);
    doc.line(m, 14, W - m, 14);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${school.name} · Admission fees`, m, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`${periodLabel} · page ${page}`, W - m, 9, { align: "right" });
  };

  let y = 46;

  const stampFooter = () => {
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.text("Timelly · Confidential school report. Amounts in INR.", m, H - 6);
    doc.text(`Page ${page}`, W - m, H - 6, { align: "right" });
  };

  const newPage = () => {
    stampFooter();
    doc.addPage();
    page += 1;
    drawPageBackground();
    drawContinuationHeader();
    y = 22;
  };

  /** If a page break runs, optional callback redraws the active table header on the new page. */
  const ensureSpace = (need: number, onAfterBreak?: () => void) => {
    if (y + need > H - 14) {
      newPage();
      onAfterBreak?.();
    }
  };

  drawPageBackground();
  drawHeroHeader();

  const drawKpiCard = (
    x: number,
    cy: number,
    w: number,
    h: number,
    title: string,
    lines: string[],
    accent: boolean
  ) => {
    doc.setDrawColor(...line);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cy, w, h, 3, 3, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(title, x + 5, cy + 8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...text);
    let vy = cy + 15;
    lines.forEach((lineText, li) => {
      doc.setFontSize(li === 0 ? (accent ? 14 : 12) : 8.5);
      doc.setFont("helvetica", li === 0 ? "bold" : "normal");
      if (li > 0) doc.setTextColor(...muted);
      const wrapped = doc.splitTextToSize(lineText, w - 10);
      doc.text(wrapped, x + 5, vy);
      vy += wrapped.length * (li === 0 ? 5.5 : 4.2);
    });
  };

  const kpiGap = 5;
  const kpiRowH = 26;
  const kpiCols = 2;
  const kpiCardW = (contentW - kpiGap * (kpiCols - 1)) / kpiCols;
  const cardY = y;

  const cash = data.totalsByChannel?.cash;
  const online = data.totalsByChannel?.online;
  const kpiCards: Array<{ title: string; lines: string[]; accent?: boolean }> = [
    { title: "Applications (paid)", lines: [String(data.totals.count)] },
    { title: "Total collected", lines: [formatInrPdf(data.totals.amount)], accent: true },
    {
      title: "Reporting period",
      lines: [formatReportYmd(data.from), `to ${formatReportYmd(data.to)}`],
    },
  ];
  if (cash) {
    kpiCards.push({
      title: "Cash collected",
      lines: [formatInrPdf(cash.amount), `${cash.count} application${cash.count === 1 ? "" : "s"}`],
    });
  }
  if (online) {
    kpiCards.push({
      title: "Online collected",
      lines: [formatInrPdf(online.amount), `${online.count} application${online.count === 1 ? "" : "s"}`],
    });
  }

  const kpiRows = Math.ceil(kpiCards.length / kpiCols);
  kpiCards.forEach((card, i) => {
    const col = i % kpiCols;
    const row = Math.floor(i / kpiCols);
    const x = m + col * (kpiCardW + kpiGap);
    const cy = cardY + row * (kpiRowH + kpiGap);
    drawKpiCard(x, cy, kpiCardW, kpiRowH, card.title, card.lines, card.accent ?? false);
  });

  const kpiBlockH = kpiRows * kpiRowH + (kpiRows - 1) * kpiGap;
  y = cardY + kpiBlockH + 10;

  const padX = 3;
  const lineHeightMm = (fontSize: number) => fontSize * 0.352778 * 1.18;

  const colStarts = (widths: number[]) => {
    const xs: number[] = [m];
    for (let i = 0; i < widths.length - 1; i++) xs.push(xs[i]! + widths[i]!);
    return xs;
  };

  const cellBaseline = (rowTop: number, rowH: number, lineCount: number, fontSize: number) => {
    const blockH = lineCount * lineHeightMm(fontSize);
    return rowTop + Math.max(4.5, (rowH - blockH) / 2 + lineHeightMm(fontSize));
  };

  const writeCell = (
    lines: string[],
    colX: number,
    colW: number,
    rowTop: number,
    rowH: number,
    align: PdfAlign,
    opts?: { bold?: boolean; color?: Rgb; fontSize?: number }
  ) => {
    const fontSize = opts?.fontSize ?? 8.5;
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color ?? text));
    const innerW = colW - padX * 2;
    const anchorX =
      align === "right" ? colX + colW - padX : align === "center" ? colX + colW / 2 : colX + padX;
    let ty = cellBaseline(rowTop, rowH, lines.length, fontSize);
    for (const lineText of lines) {
      doc.text(lineText, anchorX, ty, { align, maxWidth: innerW });
      ty += lineHeightMm(fontSize);
    }
  };

  const paintZebraRow = (rowTop: number, rowH: number, idx: number) => {
    if (idx % 2 === 0) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(248, 250, 252);
    doc.rect(m, rowTop, contentW, rowH, "F");
    doc.setDrawColor(...line);
    doc.line(m, rowTop + rowH, m + contentW, rowTop + rowH);
  };

  // Section: Summary table
  ensureSpace(28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...text);
  doc.text(groupMode === "day" ? "Summary by date" : "Summary by month", m, y);
  y += 7;

  const sumWidths = columnWidths(contentW, [54, 16, 30]);
  const sumXs = colStarts(sumWidths);
  const sumAligns: PdfAlign[] = ["left", "center", "right"];
  const sumHeaders = [
    groupMode === "day" ? "Date" : "Month",
    "Applications",
    "Amount",
  ];
  const sumHeaderH = 9;
  const sumRowH = 8;

  const drawSummaryHeader = () => {
    doc.setDrawColor(...line);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(m, y, contentW, sumHeaderH, 1.2, 1.2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    sumHeaders.forEach((label, i) => {
      writeCell([label], sumXs[i]!, sumWidths[i]!, y, sumHeaderH, sumAligns[i]!, {
        bold: true,
        color: text,
        fontSize: 8.5,
      });
    });
    y += sumHeaderH;
  };

  drawSummaryHeader();
  buckets.forEach((b, idx) => {
    ensureSpace(sumRowH + 1, drawSummaryHeader);
    paintZebraRow(y, sumRowH, idx);
    writeCell(
      [formatSummaryPeriod(b.period, groupMode)],
      sumXs[0]!,
      sumWidths[0]!,
      y,
      sumRowH,
      "left"
    );
    writeCell([String(b.count)], sumXs[1]!, sumWidths[1]!, y, sumRowH, "center");
    writeCell(
      [formatInrPdf(b.amount)],
      sumXs[2]!,
      sumWidths[2]!,
      y,
      sumRowH,
      "right",
      { bold: true, color: text }
    );
    y += sumRowH;
  });
  y += 10;

  // Applications detail
  if (data.applications.length > 0) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...text);
    doc.text("Application detail", m, y);
    y += 7;

    const dWidths = columnWidths(contentW, [11, 24, 13, 9, 15, 8, 20]);
    const dXs = colStarts(dWidths);
    const dHeaders = ["App. no.", "Applicant", "Class / grade", "Fee", "Paid on", "Mode", "Method"];
    const dAligns: PdfAlign[] = ["left", "left", "left", "right", "left", "center", "left"];
    const detailHeaderH = 9;

    const drawDetailHeader = () => {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...line);
      doc.setLineWidth(0.25);
      doc.roundedRect(m, y, contentW, detailHeaderH, 1.2, 1.2, "FD");
      dHeaders.forEach((label, i) => {
        writeCell([label], dXs[i]!, dWidths[i]!, y, detailHeaderH, dAligns[i]!, {
          bold: true,
          color: text,
          fontSize: 7.8,
        });
      });
      y += detailHeaderH;
    };

    drawDetailHeader();

    data.applications.forEach((a, idx) => {
      const methodFmt = formatPaymentMethodPdf(a.paymentMethod);
      const methodLines = methodFmt.detail
        ? [methodFmt.primary, methodFmt.detail]
        : [methodFmt.primary];
      const paidLines = doc.splitTextToSize(
        new Date(a.paidAtIso).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        dWidths[4]! - padX * 2
      );
      const nameLines = doc.splitTextToSize(a.applicantName, dWidths[1]! - padX * 2);
      const classLines = doc.splitTextToSize(a.classOrGrade, dWidths[2]! - padX * 2);
      const appNoLines = doc.splitTextToSize(a.applicationNo, dWidths[0]! - padX * 2);
      const lineCount = Math.max(
        1,
        appNoLines.length,
        nameLines.length,
        classLines.length,
        paidLines.length,
        methodLines.length
      );
      const rowHeight = Math.max(8, 3 + lineCount * lineHeightMm(7.5));

      ensureSpace(rowHeight + 1, drawDetailHeader);
      paintZebraRow(y, rowHeight, idx);

      writeCell(appNoLines, dXs[0]!, dWidths[0]!, y, rowHeight, "left", { fontSize: 7.5 });
      writeCell(nameLines, dXs[1]!, dWidths[1]!, y, rowHeight, "left", { fontSize: 7.5 });
      writeCell(classLines, dXs[2]!, dWidths[2]!, y, rowHeight, "left", { fontSize: 7.5 });
      writeCell(
        [formatInrPdf(a.admissionFee)],
        dXs[3]!,
        dWidths[3]!,
        y,
        rowHeight,
        "right",
        { bold: true, color: text, fontSize: 7.5 }
      );
      writeCell(paidLines, dXs[4]!, dWidths[4]!, y, rowHeight, "left", { fontSize: 7.2 });
      writeCell(
        [formatPaymentModePdf(a.paymentMode)],
        dXs[5]!,
        dWidths[5]!,
        y,
        rowHeight,
        "center",
        { fontSize: 7.5 }
      );
      writeCell(methodLines, dXs[6]!, dWidths[6]!, y, rowHeight, "left", { fontSize: 7.2 });

      y += rowHeight;
    });
  } else {
    ensureSpace(12);
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("No paid admission fees in this range.", m, y);
    y += 8;
  }

  ensureSpace(14);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Signature of Chairman", m, y);
  doc.text("Signature of Cashier", W - m, y, { align: "right" });

  stampFooter();
  doc.save(`admission-fee-report-${data.from}-to-${data.to}.pdf`);
}
