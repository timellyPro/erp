import ExcelJS from "exceljs";

/**
 * Read the first sheet of an uploaded .xlsx workbook into an array of plain
 * row objects keyed by header (row 1), mirroring what `xlsx`'s
 * `XLSX.utils.sheet_to_json(XLSX.read(buffer).Sheets[...])` produced.
 *
 * Uses exceljs instead of the `xlsx` package for this specifically because
 * this reads attacker-controlled bytes (a user-uploaded file) — `xlsx` has
 * an unpatched prototype-pollution and ReDoS advisory in its parser with no
 * fix available (see docs/SECURITY_REVIEW.md / npm audit). exceljs isn't
 * affected by those advisories. Export/write-only call sites elsewhere in
 * the app are left on `xlsx` since they never parse untrusted input.
 */
export async function readFirstSheetRows(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cellText(cell.value) ?? "").trim();
  });
  if (headers.every((h) => !h)) return [];

  const rows: Record<string, unknown>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;

    const obj: Record<string, unknown> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = cellText(cell.value);
      if (value !== null && value !== undefined && value !== "") hasValue = true;
      obj[header] = value;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

/** Unwrap exceljs's richer cell.value shapes (formula results, rich text) into a plain value. */
function cellText(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return cellText((value as { result: ExcelJS.CellValue }).result);
    if ("richText" in value) {
      return (value as { richText: Array<{ text: string }> }).richText.map((t) => t.text).join("");
    }
    if ("text" in value) return (value as { text: unknown }).text;
    if ("error" in value) return null;
  }
  return value as unknown;
}

/**
 * Convert an Excel 1900-date-system serial number to a UTC y/m/d triple,
 * matching what `XLSX.SSF.parse_date_code(serial)` returned. Only needed as
 * a fallback for numeric cells exceljs didn't already resolve to a `Date`
 * (it resolves date-formatted cells to `Date` automatically).
 */
export function excelSerialToYmd(serial: number): { y: number; m: number; d: number } {
  // Excel's day 0 is 1899-12-30 (keeps the historical 1900 leap-year bug's offset consistent).
  const epochMs = Date.UTC(1899, 11, 30);
  const dt = new Date(epochMs + Math.round(serial) * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
