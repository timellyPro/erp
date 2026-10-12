import jsPDF from "jspdf";
import {
  fetchSchoolMeta,
  formatInr,
  loadImageAsDataUrl,
  rangeLabel,
  type ComparisonReport,
  type ComparisonRow,
} from "./feesComparisonTypes";

export async function exportPdf(report: ComparisonReport) {
  const school = await fetchSchoolMeta();
  const logoData = school.logoUrl ? await loadImageAsDataUrl(school.logoUrl) : null;
  const logoFormat = logoData?.startsWith("data:image/jpeg")
    ? "JPEG"
    : logoData?.startsWith("data:image/webp")
      ? "WEBP"
      : "PNG";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const col = {
    type: margin + 2,
    head: margin + 26,
    rangeA: margin + 104,
    rangeB: margin + 132,
    diff: margin + 160,
    count: margin + 184,
  };

  const drawHeader = (pageNo: number) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    if (logoData) {
      try {
        doc.addImage(logoData, logoFormat, margin, 10, 18, 18);
      } catch {
        // Ignore unsupported image data.
      }
    }

    const titleX = logoData ? margin + 24 : margin;
    const maxSchoolTextWidth = pageWidth - titleX - margin;
    const addressLines = doc.splitTextToSize(school.address, maxSchoolTextWidth).slice(0, 2);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(school.name, titleX, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(addressLines, titleX, 20);

    doc.setDrawColor(0, 0, 0);
    doc.line(margin, 31, pageWidth - margin, 31);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Fees Comparison Report", pageWidth / 2, 39, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")} | Page ${pageNo}`, pageWidth / 2, 45, { align: "center" });

    const cardY = 53;
    const cardW = (pageWidth - margin * 2 - 6) / 3;
    const cards = [
      { label: "Range 1", value: formatInr(report.totals.rangeAAmount), sub: rangeLabel(report.rangeA) },
      { label: "Range 2", value: formatInr(report.totals.rangeBAmount), sub: rangeLabel(report.rangeB) },
      { label: "Difference", value: formatInr(report.totals.difference), sub: "Range 2 minus Range 1" },
    ] as const;
    cards.forEach((card, idx) => {
      const x = margin + idx * (cardW + 3);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(0, 0, 0);
      doc.rect(x, cardY, cardW, 22, "S");
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(card.label.toUpperCase(), x + 4, cardY + 6);
      doc.setFontSize(11);
      doc.text(card.value, x + 4, cardY + 12.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(doc.splitTextToSize(card.sub, cardW - 8)[0] ?? card.sub, x + 4, cardY + 17);
    });

    doc.setDrawColor(0, 0, 0);
    doc.line(margin, 84, pageWidth - margin, 84);
    doc.line(margin, 93, pageWidth - margin, 93);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("TYPE", col.type, 90);
    doc.text("HEAD", col.head, 90);
    doc.text("RANGE 1", col.rangeA, 90, { align: "right" });
    doc.text("RANGE 2", col.rangeB, 90, { align: "right" });
    doc.text("DIFF", col.diff, 90, { align: "right" });
    doc.text("COUNT", col.count, 90, { align: "right" });
  };

  let y = 101;
  let pageNo = 1;
  drawHeader(pageNo);

  const drawFooter = () => {
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Timelly School ERP", margin, pageHeight - 6);
    doc.text(`Page ${pageNo}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  };

  const drawRow = (row: ComparisonRow | null, _index: number) => {
    if (y > pageHeight - 18) {
      drawFooter();
      doc.addPage();
      pageNo += 1;
      y = 101;
      drawHeader(pageNo);
    }
    const isTotal = row === null;

    doc.setFont("helvetica", isTotal ? "bold" : "normal");
    doc.setFontSize(7.2);
    const type = isTotal ? "Total" : row.category === "PETTY_CASH" ? "Petty cash" : "Fees";
    const head = isTotal ? "Total" : row.head;
    const rangeAAmount = isTotal ? report.totals.rangeAAmount : row.rangeAAmount;
    const rangeBAmount = isTotal ? report.totals.rangeBAmount : row.rangeBAmount;
    const difference = isTotal ? report.totals.difference : row.difference;
    const countText = isTotal ? "-" : `${row.rangeACount}/${row.rangeBCount}`;

    doc.setTextColor(0, 0, 0);
    if (isTotal) {
      doc.setDrawColor(0, 0, 0);
      doc.line(margin, y - 5, pageWidth - margin, y - 5);
    }
    doc.text(type, col.type, y);
    doc.text(doc.splitTextToSize(head, 74)[0] ?? head, col.head, y);
    doc.text(Math.round(rangeAAmount).toLocaleString("en-IN"), col.rangeA, y, { align: "right" });
    doc.text(Math.round(rangeBAmount).toLocaleString("en-IN"), col.rangeB, y, { align: "right" });
    doc.text(Math.round(difference).toLocaleString("en-IN"), col.diff, y, { align: "right" });
    doc.text(countText, col.count, y, { align: "right" });
    y += 6.5;
  };

  report.rows.forEach((row, index) => drawRow(row, index));
  y += 2;
  drawRow(null, report.rows.length);
  drawFooter();
  doc.save(`fees-comparison-${report.rangeA.from}_vs_${report.rangeB.from}.pdf`);
}
