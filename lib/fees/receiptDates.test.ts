import { formatReceiptGeneratedDate, formatReceiptTransactionDate } from "./receiptDates";

describe("formatReceiptTransactionDate", () => {
  it("returns a dash for empty values", () => {
    expect(formatReceiptTransactionDate(null)).toBe("-");
    expect(formatReceiptTransactionDate(undefined)).toBe("-");
    expect(formatReceiptTransactionDate("")).toBe("-");
  });

  it("reformats ISO date strings without timezone shifting", () => {
    expect(formatReceiptTransactionDate("2026-03-05")).toBe("05-03-2026");
    expect(formatReceiptTransactionDate("2026-03-05T23:59:59.000Z")).toBe("05-03-2026");
  });

  it("formats Date objects in local time", () => {
    expect(formatReceiptTransactionDate(new Date(2026, 0, 9, 10, 30))).toBe("09-01-2026");
  });

  it("returns a dash for unparseable input", () => {
    expect(formatReceiptTransactionDate("not a date")).toBe("-");
    expect(formatReceiptTransactionDate(new Date("nope"))).toBe("-");
  });
});

describe("formatReceiptGeneratedDate", () => {
  it("includes the date and 12-hour time", () => {
    expect(formatReceiptGeneratedDate(new Date(2026, 0, 9, 15, 5))).toBe("09-01-2026, 3:05 PM");
    expect(formatReceiptGeneratedDate(new Date(2026, 0, 9, 0, 7))).toBe("09-01-2026, 12:07 AM");
  });
});
