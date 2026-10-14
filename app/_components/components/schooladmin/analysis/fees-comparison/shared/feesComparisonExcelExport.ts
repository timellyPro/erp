import * as XLSX from "xlsx";
import { rangeLabel, type ComparisonReport } from "./feesComparisonTypes";

export function exportExcel(report: ComparisonReport) {
  const rows = report.rows.map((row) => ({
    Type: row.category === "PETTY_CASH" ? "Petty cash" : "Fees",
    Head: row.head,
    [`Range 1 (${rangeLabel(report.rangeA)})`]: row.rangeAAmount,
    [`Range 2 (${rangeLabel(report.rangeB)})`]: row.rangeBAmount,
    Difference: row.difference,
    "Range 1 Count": row.rangeACount,
    "Range 2 Count": row.rangeBCount,
  }));

  rows.push({
    Type: "Total",
    Head: "Total",
    [`Range 1 (${rangeLabel(report.rangeA)})`]: report.totals.rangeAAmount,
    [`Range 2 (${rangeLabel(report.rangeB)})`]: report.totals.rangeBAmount,
    Difference: report.totals.difference,
    "Range 1 Count": 0,
    "Range 2 Count": 0,
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 14 },
    { wch: 30 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Fees Comparison");
  XLSX.writeFile(wb, `fees-comparison-${report.rangeA.from}_vs_${report.rangeB.from}.xlsx`);
}
