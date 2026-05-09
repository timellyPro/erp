import ExcelJS from "exceljs";
import { feeDueGroupHeaderNames, type FeeDueReportPayload } from "@/lib/feeDueReportCompute";

const STATIC_HEADERS = [
  "No.",
  "Name",
  "Admission No.",
  "Section name",
  "Parent",
  "mobile",
  "Category",
  "Total fees",
  "Total discount",
  "Fees paid",
  "Fees Due",
] as const;

const GROUP_FILL_COLORS = ["FFF2CC", "DDEBF7", "B4C6E7", "E2D5F7", "C6E0B4", "F8CBAD", "D9D9D9", "FCE4D6"];

function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Build styled Fee Due Report workbook (matches common school fee-due sheet layout). */
export async function buildFeeDueReportWorkbook(payload: FeeDueReportPayload): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP";
  const sheet = workbook.addWorksheet("Fee Due Report", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 0 }],
  });

  const nStatic = STATIC_HEADERS.length;
  const nGroups = payload.groups.length;
  const totalCols = nStatic + nGroups * 4;

  const title = "Fee Due Report";
  const subtitle = [
    payload.schoolName?.trim() || "School",
    `Generated: ${new Date(payload.generatedAt).toLocaleString("en-IN")}`,
  ].join(" — ");

  sheet.mergeCells(1, 1, 1, totalCols);
  const tCell = sheet.getCell(1, 1);
  tCell.value = title;
  tCell.font = { bold: true, size: 14, color: { argb: "FF1F2937" } };
  tCell.alignment = { vertical: "middle", horizontal: "center" };
  tCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE7E6E6" },
  };

  sheet.mergeCells(2, 1, 2, totalCols);
  const sCell = sheet.getCell(2, 1);
  sCell.value = subtitle;
  sCell.font = { size: 10, color: { argb: "FF4B5563" } };
  sCell.alignment = { vertical: "middle", horizontal: "center" };

  const headerFont = { bold: true, size: 9, color: { argb: "FF111827" } };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFBFBFBF" } },
    left: { style: "thin", color: { argb: "FFBFBFBF" } },
    bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
    right: { style: "thin", color: { argb: "FFBFBFBF" } },
  };

  // Rows 3–4: static columns merged vertically; row 3 group titles; row 4 fee sub-headers
  for (let c = 1; c <= nStatic; c++) {
    sheet.mergeCells(3, c, 4, c);
    const cell = sheet.getCell(3, c);
    cell.value = STATIC_HEADERS[c - 1];
    cell.font = headerFont;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder as ExcelJS.Borders;
  }
  for (let g = 0; g < nGroups; g++) {
    const startCol = nStatic + g * 4 + 1;
    const endCol = startCol + 3;
    sheet.mergeCells(3, startCol, 3, endCol);
    const gc = sheet.getCell(3, startCol);
    const raw = payload.groups[g].label.trim();
    const groupTitle = raw.replace(/\s+fee$/i, "").trim() || raw;
    gc.value = groupTitle;
    gc.font = { bold: true, size: 9, color: { argb: "FF111827" } };
    gc.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    const fill = GROUP_FILL_COLORS[g % GROUP_FILL_COLORS.length];
    gc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
    gc.border = thinBorder as ExcelJS.Borders;
  }
  for (let g = 0; g < nGroups; g++) {
    const startCol = nStatic + g * 4 + 1;
    const fill = GROUP_FILL_COLORS[g % GROUP_FILL_COLORS.length];
    const names = feeDueGroupHeaderNames(payload.groups[g].label);
    const sub = [names.fee, names.concession, names.paid, names.due];
    for (let j = 0; j < 4; j++) {
      const cell = sheet.getCell(4, startCol + j);
      cell.value = sub[j];
      cell.font = { bold: true, size: 8, color: { argb: "FF111827" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = thinBorder as ExcelJS.Borders;
    }
  }

  let rowIdx = 5;
  for (const row of payload.rows) {
    const values: (string | number)[] = [
      row.no,
      row.name,
      row.admissionNo,
      row.section,
      row.parent,
      row.mobile,
      row.category,
      money(row.totalFee),
      money(row.totalDiscount),
      money(row.feesPaid),
      money(row.feesDue),
    ];
    for (let c = 0; c < nStatic; c++) {
      const cell = sheet.getCell(rowIdx, c + 1);
      cell.value = values[c];
      cell.font = { size: 9 };
      cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "center", wrapText: true };
      cell.border = thinBorder as ExcelJS.Borders;
      if (c >= 7 && c <= 10) {
        cell.numFmt = "#,##0.00";
      }
    }
    for (let g = 0; g < nGroups; g++) {
      const gid = payload.groups[g].id;
      const cellPack = row.cellsByGroupId[gid] ?? { fee: 0, concession: 0, paid: 0, due: 0 };
      const nums = [money(cellPack.fee), money(cellPack.concession), money(cellPack.paid), money(cellPack.due)];
      const startCol = nStatic + g * 4 + 1;
      for (let j = 0; j < 4; j++) {
        const cell = sheet.getCell(rowIdx, startCol + j);
        cell.value = nums[j];
        cell.font = { size: 9 };
        cell.numFmt = "#,##0.00";
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.border = thinBorder as ExcelJS.Borders;
      }
    }
    rowIdx += 1;
  }

  sheet.getRow(1).height = 22;
  sheet.getRow(2).height = 18;
  sheet.getRow(3).height = 22;
  sheet.getRow(4).height = 28;

  for (let c = 1; c <= totalCols; c++) {
    let maxLen = 10;
    for (let r = 1; r <= Math.min(rowIdx - 1, 12); r++) {
      const v = sheet.getCell(r, c).value;
      const s = v == null ? "" : String(v);
      maxLen = Math.max(maxLen, Math.min(s.length, 40));
    }
    sheet.getColumn(c).width = Math.min(22, Math.max(8, maxLen * 0.9 + 2));
  }

  return workbook;
}
