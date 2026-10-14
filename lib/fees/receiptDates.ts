import { format } from "date-fns";

/** Payment / transaction date on the receipt (not print time). */
export function formatReceiptTransactionDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "-";
  if (typeof value === "string") {
    const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) {
      const [, yyyy, mm, dd] = isoDate;
      return `${dd}-${mm}-${yyyy}`;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "dd-MM-yyyy");
}

/** "Generated on" line — always the moment the receipt is rendered / printed. */
export function formatReceiptGeneratedDate(ref: Date = new Date()): string {
  return format(ref, "dd-MM-yyyy, h:mm a");
}
