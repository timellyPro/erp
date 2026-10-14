/**
 * @jest-environment node
 */
import * as XLSX from "xlsx";
import { readFirstSheetRows, excelSerialToYmd } from "./readWorkbookRows";

function bufferFromRows(rows: Record<string, unknown>[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("readFirstSheetRows", () => {
  it("reads rows keyed by the header row", async () => {
    const buffer = bufferFromRows([
      { Name: "Alice", Age: 10 },
      { Name: "Bob", Age: 12 },
    ]);
    const rows = await readFirstSheetRows(buffer);
    expect(rows).toEqual([
      { Name: "Alice", Age: 10 },
      { Name: "Bob", Age: 12 },
    ]);
  });

  it("returns an empty array for a sheet with no rows", async () => {
    const buffer = bufferFromRows([]);
    const rows = await readFirstSheetRows(buffer);
    expect(rows).toEqual([]);
  });

  it("skips fully-empty rows", async () => {
    const buffer = bufferFromRows([{ Name: "Alice", Age: 10 }]);
    const rows = await readFirstSheetRows(buffer);
    expect(rows).toHaveLength(1);
  });
});

describe("excelSerialToYmd", () => {
  it("converts a known Excel date serial to y/m/d", () => {
    // Excel serial 1 = 1899-12-31 under the 1900 date system.
    expect(excelSerialToYmd(1)).toEqual({ y: 1899, m: 12, d: 31 });
    // Excel serial 45658 = 2025-01-01.
    expect(excelSerialToYmd(45658)).toEqual({ y: 2025, m: 1, d: 1 });
  });
});
