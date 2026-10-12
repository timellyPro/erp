import jsPDF from "jspdf";
import type { SchoolAdminClassRow } from "@/lib/school/loadSchoolAdminFastTabs";

export async function generateClassesReportPdf(rowsToExport: SchoolAdminClassRow[]) {
  const pageWidth = 842;
  const pageHeight = 595;
  const marginX = 40;
  const topMargin = 44;
  const bottomMargin = 40;
  const titleSize = 18;
  const metaSize = 10;
  const headerSize = 10;
  const cellSize = 10;
  const rowHeight = 22;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [pageWidth, pageHeight] });

  const columns = [
    { header: "CLASS NAME", width: 220, key: "name" as const },
    { header: "SECTION", width: 120, key: "section" as const },
    { header: "STUDENTS", width: 90, key: "students" as const },
    { header: "CLASS TEACHER", width: 190, key: "teacher" as const },
    { header: "EMAIL", width: 170, key: "subject" as const },
  ];

  const truncateText = (value: string, maxWidth: number, useBold = false) => {
    doc.setFont("helvetica", useBold ? "bold" : "normal");
    doc.setFontSize(cellSize);
    let text = value ?? "";
    while (text.length > 0 && doc.getTextWidth(text) > maxWidth) {
      text = text.slice(0, -1);
    }
    if (text !== value) {
      const dots = "...";
      while (text.length > 0 && doc.getTextWidth(`${text}${dots}`) > maxWidth) {
        text = text.slice(0, -1);
      }
      return `${text}${dots}`;
    }
    return text;
  };

  // jsPDF's y grows downward (unlike pdf-lib's bottom-up y), so this draws
  // text/lines at pageHeight - y to keep the same top-down layout math below.
  const drawHeaderRow = (y: number) => {
    let x = marginX;
    doc.setDrawColor(209, 209, 209);
    doc.setLineWidth(1);
    doc.line(marginX, pageHeight - (y + 5), pageWidth - marginX, pageHeight - (y + 5));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(headerSize);
    doc.setTextColor(38, 38, 38);
    columns.forEach((column) => {
      doc.text(column.header, x + 2, pageHeight - y);
      x += column.width;
    });
    doc.line(marginX, pageHeight - (y - 6), pageWidth - marginX, pageHeight - (y - 6));
  };

  const makePage = (isFirst: boolean) => {
    if (!isFirst) doc.addPage([pageWidth, pageHeight], "landscape");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(titleSize);
    doc.setTextColor(13, 13, 13);
    doc.text("Classes Report", marginX, pageHeight - (pageHeight - topMargin));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(metaSize);
    doc.setTextColor(89, 89, 89);
    doc.text(
      `Generated on ${new Date().toLocaleString()} | Total Classes: ${rowsToExport.length}`,
      marginX,
      pageHeight - (pageHeight - topMargin - 16)
    );
    const startY = pageHeight - topMargin - 40;
    drawHeaderRow(startY);
    return startY - 18;
  };

  let y = makePage(true);

  rowsToExport.forEach((row) => {
    if (y < bottomMargin + rowHeight) {
      y = makePage(false);
    }

    let x = marginX;
    const values = [
      row.name,
      row.section,
      String(row.students),
      row.teacher,
      row.subject || "-",
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(cellSize);
    doc.setTextColor(26, 26, 26);
    values.forEach((value, idx) => {
      doc.text(truncateText(String(value ?? ""), columns[idx].width - 6), x + 2, pageHeight - y);
      x += columns[idx].width;
    });

    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageHeight - (y - 6), pageWidth - marginX, pageHeight - (y - 6));
    y -= rowHeight;
  });

  const date = new Date().toISOString().slice(0, 10);
  doc.save(`classes-report-${date}.pdf`);
}
