import type {
  AnalysisResponse,
  EnrollmentGroupRow,
  EnrollmentSectionRow,
  GenderViewMode,
} from "./types";
import {
  fetchFeeSummaryForExport,
  fetchFeeTransactionsForExport,
} from "@/lib/api/analysis";

export const makeSafeFileName = (base: string, ext: string) =>
  `${base.replace(/[^\w-]+/g, "_").toLowerCase()}.${ext}`;

export async function exportWithXlsx(
  rows: Array<Record<string, string | number>>,
  sheetName: string,
  filenameBase: string
) {
  if (rows.length === 0) {
    alert("No data available to export.");
    return;
  }
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, makeSafeFileName(filenameBase, "xlsx"));
}

function toGenderExportRow(
  row: EnrollmentGroupRow | EnrollmentSectionRow,
  mode: GenderViewMode
): Record<string, string | number> {
  return mode === "CLASS_WISE"
    ? {
        Class: row.groupLabel,
        Male: row.male,
        Female: row.female,
        Total: row.total,
      }
    : {
        Class: (row as EnrollmentSectionRow).className,
        Section: (row as EnrollmentSectionRow).section,
        Male: row.male,
        Female: row.female,
        Total: row.total,
      };
}

export function buildAnalysisExports({
  data,
  year,
  classId,
  selectedYear,
  feeSearch,
  feeClassSectionFilter,
  enrollmentClassWiseRows,
  enrollmentSectionWiseRows,
  admissionComparisonRows,
  admissionComparisonTotals,
}: {
  data: AnalysisResponse;
  year: number;
  classId: string;
  selectedYear: number;
  feeSearch: string;
  feeClassSectionFilter: string;
  enrollmentClassWiseRows: EnrollmentGroupRow[];
  enrollmentSectionWiseRows: EnrollmentSectionRow[];
  admissionComparisonRows: NonNullable<AnalysisResponse["admissionComparison"]>;
  admissionComparisonTotals: AnalysisResponse["admissionComparisonTotals"];
}) {
  const formatInr = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
  const getAcademicYearLabel = () => {
    const y = year !== 0 ? year : selectedYear;
    return `${y}-${y + 1}`;
  };

  const exportGenderExcel = async (mode: GenderViewMode) => {
    const rows = mode === "CLASS_WISE" ? enrollmentClassWiseRows : enrollmentSectionWiseRows;
    const exportRows = rows.map((row) => toGenderExportRow(row, mode));
    const fileSuffix = mode === "CLASS_WISE" ? "class_wise" : "section_wise";
    try {
      await exportWithXlsx(
        exportRows,
        mode === "CLASS_WISE" ? "Gender Class-wise" : "Gender Section-wise",
        `gender_distribution_${fileSuffix}_${getAcademicYearLabel()}`
      );
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    }
  };

  const exportAdmissionComparisonExcel = async () => {
    if (admissionComparisonRows.length === 0) {
      alert("No data available to export.");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const title = `COMPARISON REPORT OF NEW ADMISSION ${getAcademicYearLabel()}`;
      const aoa: Array<Array<string | number>> = [
        [title, "", "", "", "", "", "", "", ""],
        ["CLASS", "EXISTING", "", "", "", "NEW", "", "", ""],
        ["", "DAY SCHOLAR", "", "HOSTEL", "", "DAY SCHOLAR", "", "HOSTEL", ""],
        ["", "MALE", "FEMALE", "MALE", "FEMALE", "MALE", "FEMALE", "MALE", "FEMALE"],
      ];

      for (const row of admissionComparisonRows) {
        aoa.push([
          row.classLabel,
          row.existingDayScholarMale,
          row.existingDayScholarFemale,
          row.existingHostelMale,
          row.existingHostelFemale,
          row.newDayScholarMale,
          row.newDayScholarFemale,
          row.newHostelMale,
          row.newHostelFemale,
        ]);
      }

      if (admissionComparisonTotals) {
        aoa.push([
          "TOTAL",
          admissionComparisonTotals.existingDayScholarMale,
          admissionComparisonTotals.existingDayScholarFemale,
          admissionComparisonTotals.existingHostelMale,
          admissionComparisonTotals.existingHostelFemale,
          admissionComparisonTotals.newDayScholarMale,
          admissionComparisonTotals.newDayScholarFemale,
          admissionComparisonTotals.newHostelMale,
          admissionComparisonTotals.newHostelFemale,
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // title
        { s: { r: 1, c: 1 }, e: { r: 1, c: 4 } }, // existing
        { s: { r: 1, c: 5 }, e: { r: 1, c: 8 } }, // new
        { s: { r: 2, c: 1 }, e: { r: 2, c: 2 } }, // existing day scholar
        { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } }, // existing hostel
        { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } }, // new day scholar
        { s: { r: 2, c: 7 }, e: { r: 2, c: 8 } }, // new hostel
      ];
      ws["!cols"] = [
        { wch: 22 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
        { wch: 11 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Comparison report");
      XLSX.writeFile(
        wb,
        makeSafeFileName(`new_admission_comparison_table_view_${getAcademicYearLabel()}`, "xlsx")
      );
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    }
  };

  const exportPaymentDetailsExcel = async () => {
    try {
      const [txResult, summaryResult] = await Promise.all([
        fetchFeeTransactionsForExport(),
        fetchFeeSummaryForExport(),
      ]);
      const txData = txResult.data;
      const summaryData = summaryResult.data;
      if (!txResult.ok) {
        alert(txData?.message || "Failed to fetch payment transactions.");
        return;
      }

      const transactions: Array<{
        amount: number;
        createdAt: string;
        transactionId?: string | null;
        feeAllocations?: Array<{ name: string; amount: number }>;
        student: {
          id: string;
          admissionNumber?: string | null;
          user?: { name?: string | null };
          class?: { name?: string | null; section?: string | null } | null;
        };
      }> = Array.isArray(txData?.transactions) ? txData.transactions : [];

      const summaryFees: Array<{
        student: { id: string };
        totalFee: number;
        finalFee: number;
        amountPaid: number;
        remainingFee: number;
      }> = Array.isArray(summaryData?.fees) ? summaryData.fees : [];

      const studentTotals = summaryFees.reduce((acc, fee) => {
        const id = fee.student?.id;
        if (!id) return acc;
        const curr = acc.get(id) ?? { totalAmount: 0, discount: 0, paidAmount: 0, pendingAmount: 0 };
        curr.totalAmount += Number(fee.totalFee || 0);
        curr.discount += Math.max(Number(fee.totalFee || 0) - Number(fee.finalFee || 0), 0);
        curr.paidAmount += Number(fee.amountPaid || 0);
        curr.pendingAmount += Number(fee.remainingFee || 0);
        acc.set(id, curr);
        return acc;
      }, new Map<string, { totalAmount: number; discount: number; paidAmount: number; pendingAmount: number }>());

      const yearStart = year !== 0 ? year : selectedYear;
      const from = new Date(yearStart, 3, 1);
      const to = new Date(yearStart + 1, 2, 31, 23, 59, 59, 999);

      const filteredTx = transactions.filter((tx) => {
        const created = new Date(tx.createdAt);
        if (Number.isNaN(created.getTime()) || created < from || created > to) return false;
        const className = tx.student.class?.name || "";
        const section = tx.student.class?.section || "";
        const label = `${className}${section ? `-${section}` : ""}`;
        if (classId && className !== ((data.classes ?? []).find((c) => c.id === classId)?.name ?? "")) return false;
        if (feeClassSectionFilter && feeClassSectionFilter !== label) return false;
        const search = feeSearch.trim().toLowerCase();
        if (search) {
          const studentName = (tx.student.user?.name || "").toLowerCase();
          const admission = (tx.student.admissionNumber || "").toLowerCase();
          if (!studentName.includes(search) && !admission.includes(search) && !label.toLowerCase().includes(search)) {
            return false;
          }
        }
        return true;
      });

      const rows = filteredTx.map((tx) => {
        const totals = studentTotals.get(tx.student.id) ?? {
          totalAmount: tx.amount,
          discount: 0,
          paidAmount: tx.amount,
          pendingAmount: 0,
        };
        const feeHeadBreakdown =
          Array.isArray(tx.feeAllocations) && tx.feeAllocations.length > 0
            ? tx.feeAllocations.map((f) => `${f.name}: ₹${Number(f.amount || 0).toLocaleString("en-IN")}`).join(" | ")
            : "Default";
        return {
          "Date of Payment": new Date(tx.createdAt).toLocaleDateString("en-IN"),
          "Student Name": tx.student.user?.name || "-",
          "Admission No": tx.student.admissionNumber || "-",
          Class: tx.student.class?.name || "-",
          Section: tx.student.class?.section || "-",
          "Fee Head Breakdown": feeHeadBreakdown,
          "Total Amount": Number(totals.totalAmount.toFixed(2)),
          Discount: Number(totals.discount.toFixed(2)),
          "Paid Amount": Number(totals.paidAmount.toFixed(2)),
          "Pending Amount": Number(totals.pendingAmount.toFixed(2)),
          "Transaction Ref": tx.transactionId || "-",
        };
      });

      await exportWithXlsx(
        rows,
        "Payment Details",
        `payment_details_student_wise_${getAcademicYearLabel()}`
      );
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    }
  };

  return { formatInr, exportGenderExcel, exportAdmissionComparisonExcel, exportPaymentDetailsExcel };
}
