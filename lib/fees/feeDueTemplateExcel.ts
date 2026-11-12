import ExcelJS from "exceljs";
import type { FeeDueReportPayload } from "@/lib/fees/feeDueReportCompute";
import {
  aggregateRowByHead,
  DUE_HEAD_LABELS,
  DUE_HEAD_ORDER,
  type DueHeadKey,
} from "@/lib/fees/feeDueTemplateHeads";

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** Column titles per head, as the school's template names them. */
function headTitles(key: DueHeadKey): [string, string, string, string] {
  const l = DUE_HEAD_LABELS[key];
  if (key === "previousYear") return ["Previous Year Fee", "Previous Year Concession", "Previous Year Fee Paid", "Previous Year Fee Due"];
  if (key === "tuition") return ["Tuition fee", "Tuition fee Concession", "Tuition fee Paid", "Tuition Fee Due"];
  if (key === "admission") return ["Admission fee", "Admission fee Concession", "Admission fee Paid", "Admission Fee Due"];
  if (key === "bus") return ["Bus Fee", "Bus Fee Concession", "Bus Fee Paid", "Bus Fee Due"];
  return [`${l} Fee`, `${l} Concession`, `${l} Fee Paid`, `${l} Fee Due`];
}

/**
 * The school's "Revenue Template" (same layout as Lotus_Fee_Due_Report_Template): sheet "Sheet1" with one
 * row per student and five fixed heads (Hostel, Mess, Bus, Tuition, Admission) plus Previous Year, and a
 * "Totals" sheet. Built from the same payload as the standard due report, so the figures are the real ones.
 * An "Other" head is added only when some student has fees outside the five heads, so Total fees adds up.
 */
export async function buildFeeDueTemplateWorkbook(payload: FeeDueReportPayload): Promise<ExcelJS.Workbook> {
  const perRow = payload.rows.map((row) => aggregateRowByHead(row, payload.groups));
  const hasOther = perRow.some((h) => h.other.fee || h.other.concession || h.other.paid || h.other.due);
  const heads: DueHeadKey[] = DUE_HEAD_ORDER.filter((k) => k !== "other" || hasOther);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  const fixed = ["No.", "Name", "Admission No.", "Section name", "Parent", "mobile", "Category", "Total fees", "Total discount", "Fees paid", "Fees Due"];
  ws.addRow([...fixed, ...heads.flatMap((k) => headTitles(k))]);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];

  payload.rows.forEach((row, i) => {
    const r = i + 2;
    const by = perRow[i];
    const values: Array<number | string | { formula: string; result: number }> = [
      row.no,
      row.name,
      row.admissionNo,
      row.section,
      row.parent,
      row.mobile,
      row.category,
      r2(row.totalFee),
      r2(row.totalDiscount),
      r2(row.feesPaid),
      { formula: `H${r}-I${r}-J${r}`, result: r2(row.feesDue) },
    ];
    heads.forEach((k, idx) => {
      const base = 12 + idx * 4;
      const c = by[k];
      values.push(r2(c.fee), r2(c.concession), r2(c.paid), {
        formula: `${colLetter(base)}${r}-${colLetter(base + 1)}${r}-${colLetter(base + 2)}${r}`,
        result: r2(c.due),
      });
    });
    ws.addRow(values);
  });

  ws.columns.forEach((c, idx) => {
    c.width = idx === 1 || idx === 4 ? 30 : idx < 7 ? 16 : 14;
  });

  const totals = wb.addWorksheet("Totals");
  totals.addRow(["Head", "Fee", "Concession", "Paid", "Due"]);
  totals.getRow(1).font = { bold: true };
  const sum = (k: DueHeadKey) =>
    perRow.reduce(
      (a, h) => ({
        fee: a.fee + h[k].fee,
        concession: a.concession + h[k].concession,
        paid: a.paid + h[k].paid,
        due: a.due + h[k].due,
      }),
      { fee: 0, concession: 0, paid: 0, due: 0 }
    );
  const current = { fee: 0, concession: 0, paid: 0, due: 0 };
  for (const k of heads.filter((h) => h !== "previousYear")) {
    const t = sum(k);
    current.fee += t.fee;
    current.concession += t.concession;
    current.paid += t.paid;
    current.due += t.due;
    totals.addRow([DUE_HEAD_LABELS[k], r2(t.fee), r2(t.concession), r2(t.paid), r2(t.due)]);
  }
  totals.addRow(["Current year total", r2(current.fee), r2(current.concession), r2(current.paid), r2(current.due)]);
  const prev = sum("previousYear");
  totals.addRow(["Previous year (extra)", r2(prev.fee), r2(prev.concession), r2(prev.paid), r2(prev.due)]);
  totals.addRow(["Students", payload.rows.length]);
  totals.getColumn(1).width = 24;
  [2, 3, 4, 5].forEach((c) => (totals.getColumn(c).width = 16));

  return wb;
}
