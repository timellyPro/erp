import jsPDF from "jspdf";
import { roundRupee } from "@/lib/formatRupee";

const loadImageAsDataUrl = async (url: string) => {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const drawPrettyPdf = async ({
  filename,
  title,
  subtitle,
  rows,
  schoolName,
  schoolAddress,
  logoUrl,
}: {
  filename: string;
  title: string;
  subtitle?: string;
  rows: Record<string, string | number>[];
  schoolName?: string;
  schoolAddress?: string;
  logoUrl?: string | null;
}) => {
  if (!rows.length) return;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const printableWidth = pageWidth - margin * 2;
  const headerLabels: Record<string, string> = {
    Date: "DATE",
    "Student Name": "STUDENT NAME",
    "Admission No": "ADMISSION NO",
    Class: "CLASS",
    "Fee Head": "FEE HEAD",
    "Payment Method": "PAYMENT MODE",
    "UTR / Ref": "UTR / REF",
    Amount: "AMOUNT (INR)",
    "Admission Email": "EMAIL",
    "Fee Type": "FEE TYPE",
    "Total Fee": "TOTAL FEE",
    "Discount %": "DISCOUNT %",
    "Discount Amount": "DISCOUNT AMOUNT",
    "Final Fee": "FINAL FEE",
    Paid: "PAID",
    Pending: "PENDING",
    Status: "STATUS",
  };
  const rightAlignHeaders = new Set(["Amount", "Total Fee", "Discount Amount", "Final Fee", "Paid", "Pending"]);
  const headers = Object.keys(rows[0]);
  const preferredWidthMap: Record<string, number> = {
    Date: 22,
    "Student Name": 42,
    "Admission No": 26,
    Class: 20,
    "Fee Head": 50,
    "Fee Type": 48,
    "Payment Method": 24,
    "UTR / Ref": 28,
    Amount: 22,
    "Admission Email": 40,
    "Total Fee": 22,
    "Discount %": 20,
    "Discount Amount": 30,
    "Final Fee": 22,
    Paid: 18,
    Pending: 22,
    Status: 18,
  };

  const baseWidths = headers.map((header) => {
    const label = headerLabels[header] || header.toUpperCase();
    const labelWidth = doc.getTextWidth(label) + 7;
    return Math.max(preferredWidthMap[header] || 18, labelWidth);
  });
  const widthTotal = baseWidths.reduce((sum, width) => sum + width, 0);
  const columnWidths = [...baseWidths];
  if (widthTotal < printableWidth) {
    const remaining = printableWidth - widthTotal;
    const growHeaders = ["Student Name", "Fee Head", "Fee Type"];
    const presentGrowHeaders = growHeaders.filter((header) => headers.includes(header));
    const growBy = presentGrowHeaders.length > 0 ? remaining / presentGrowHeaders.length : 0;
    presentGrowHeaders.forEach((header) => {
      const idx = headers.indexOf(header);
      if (idx >= 0) columnWidths[idx] += growBy;
    });
  } else if (widthTotal > printableWidth) {
    const scale = printableWidth / widthTotal;
    headers.forEach((_, idx) => {
      columnWidths[idx] = columnWidths[idx] * scale;
    });
  }
  const rowHeight = 7;

  const logoData = logoUrl ? await loadImageAsDataUrl(logoUrl) : null;

  const logoFormat = logoData?.startsWith("data:image/jpeg")
    ? "JPEG"
    : logoData?.startsWith("data:image/webp")
      ? "WEBP"
      : "PNG";

  const paintWhitePage = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.setTextColor(0, 0, 0);
  };
  paintWhitePage();

  const drawPageFrame = (isFirstPage: boolean) => {
    if (isFirstPage) {
      const schoolAddressText = (schoolAddress || "Address not available").replace(/\s+/g, " ").trim();
      const logoSize = 18;
      const headerTop = 6;
      if (logoData) {
        try {
          doc.addImage(logoData, logoFormat, margin, headerTop, logoSize, logoSize);
        } catch {
          // Ignore invalid image format gracefully.
        }
      }

      const maxAddressWidth = pageWidth - margin * 2 - (logoData ? logoSize + 8 : 0);
      const addressLines = (doc.splitTextToSize(
        schoolAddressText,
        Math.max(80, maxAddressWidth)
      ) as string[]) || ["Address not available"];
      const visibleAddressLines = addressLines.slice(0, 2);

      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(schoolName || "School", pageWidth / 2, 12, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(visibleAddressLines, pageWidth / 2, 18, { align: "center" });
      const titleY = 18 + visibleAddressLines.length * 5 + 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, pageWidth / 2, titleY, { align: "center" });
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(subtitle, pageWidth / 2, titleY + 6, { align: "center" });
      }

      const bandBottom = titleY + (subtitle ? 10 : 6);
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, bandBottom, pageWidth - margin, bandBottom);
    }

    const tableY = isFirstPage ? 44 : 10;
    doc.setFillColor(230, 236, 248);
    doc.rect(margin, tableY, printableWidth, 8.5, "F");
    doc.setDrawColor(196, 208, 229);
    doc.rect(margin, tableY, printableWidth, pageHeight - tableY - 12);

    let x = margin;
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    headers.forEach((header, idx) => {
      const label = headerLabels[header] || header.toUpperCase();
      const width = columnWidths[idx];
      if (rightAlignHeaders.has(header)) {
        doc.text(label, x + width - 2, tableY + 5.6, { align: "right" });
      } else {
        doc.text(label, x + 2, tableY + 5.6);
      }
      x += width;
    });
    return tableY + 12;
  };

  const fitTextToWidth = (text: string, maxWidth: number) => {
    if (!text) return "-";
    if (doc.getTextWidth(text) <= maxWidth) return text;
    const ellipsis = "...";
    let low = 0;
    let high = text.length;
    let best = "";
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${text.slice(0, mid)}${ellipsis}`;
      if (doc.getTextWidth(candidate) <= maxWidth) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best || ellipsis;
  };

  const fitCellText = (text: string, maxWidth: number) => {
    const normalized = text.replace(/\s+/g, " ").trim() || "-";
    const lines = doc.splitTextToSize(normalized, maxWidth) as string[];
    if (lines.length <= 1) return lines[0] || "-";
    return fitTextToWidth(normalized, maxWidth);
  };

  let y = drawPageFrame(true);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);

  rows.forEach((row, rowIndex) => {
    const studentNameIdx = headers.indexOf("Student Name");
    const studentCellWidth = studentNameIdx >= 0 ? columnWidths[studentNameIdx] : 0;
    const studentRawValue = studentNameIdx >= 0 ? row["Student Name"] : "-";
    const studentValue =
      typeof studentRawValue === "number"
        ? studentRawValue.toLocaleString("en-IN")
        : String(studentRawValue ?? "-").replace(/\s+/g, " ").trim();
    const studentLines =
      studentNameIdx >= 0
        ? ((doc.splitTextToSize(studentValue || "-", Math.max(10, studentCellWidth - 4)) as string[]) || ["-"])
        : ["-"];
    const lineHeight = 3.8;
    const dynamicRowHeight = Math.max(rowHeight, studentLines.length * lineHeight + 2.4);

    if (y + dynamicRowHeight > pageHeight - 14) {
      doc.addPage();
      paintWhitePage();
      y = drawPageFrame(false);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
    }

    const rowTop = y - 5.4;
    if (rowIndex % 2 === 0) {
      doc.setFillColor(245, 248, 255);
      doc.rect(margin + 0.2, rowTop, printableWidth - 0.4, dynamicRowHeight, "F");
    }

    let x = margin;
    headers.forEach((header, idx) => {
      const rawValue = row[header];
      const displayValue =
        typeof rawValue === "number"
          ? roundRupee(rawValue).toLocaleString("en-IN")
          : String(rawValue ?? "-");
      const width = columnWidths[idx];

      doc.setTextColor(39, 51, 79);
      if (header === "Student Name") {
        const wrappedLines = (doc.splitTextToSize(
          displayValue.replace(/\s+/g, " ").trim() || "-",
          Math.max(10, width - 4)
        ) as string[]) || ["-"];
        wrappedLines.forEach((line, lineIdx) => {
          doc.text(line, x + 2, rowTop + 4.8 + lineIdx * lineHeight);
        });
      } else {
        const clipped = fitCellText(displayValue, Math.max(10, width - 4));
        if (rightAlignHeaders.has(header)) {
          doc.text(clipped, x + width - 2, y, { align: "right" });
        } else {
          doc.text(clipped, x + 2, y);
        }
      }
      x += width;
    });
    y += dynamicRowHeight;
  });

  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth - margin, pageHeight - 5.2, {
    align: "right",
  });
  doc.save(filename);
};
