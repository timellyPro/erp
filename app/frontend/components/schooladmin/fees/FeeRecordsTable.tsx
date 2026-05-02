"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import * as XLSX from "xlsx";
import SelectInput from "../../common/SelectInput";
import type { Class, FeeRecord } from "./types";
import { schoolAdminStudentDetailsFeesUrl } from "./studentDetailsNav";
import InlinePagination from "../schooladmincomponents/InlinePagination";

const PAGE_SIZE = 20;

interface FeeRecordsTableProps {
  fees: FeeRecord[];
  classes: Class[];
}

type ReportPeriod = "DAY_WISE" | "MONTH_WISE" | "YEAR_WISE" | "ACADEMIC_YEAR_WISE";
type PaymentColumn = "Cash" | "OTHERS" | "ONLINE PAYMENT" | "Cheque" | "DD";

export default function FeeRecordsTable({ fees, classes }: FeeRecordsTableProps) {
  const router = useRouter();
  const [searchName, setSearchName] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("DAY_WISE");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [academicYear, setAcademicYear] = useState(() => {
    const now = new Date();
    const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}-${start + 1}`;
  });
  const [page, setPage] = useState(1);

  const filteredFees = fees.filter((f) => {
    const name = (f.student.user?.name || "").toLowerCase();
    const q = searchName.toLowerCase();
    if (q && !name.includes(q)) return false;
    if (selectedClass && f.student.class?.id !== selectedClass) return false;
    return true;
  });

  useEffect(() => {
    setPage(1);
  }, [searchName, selectedClass]);

  const totalPages = Math.max(1, Math.ceil(filteredFees.length / PAGE_SIZE));
  const paginatedFees = useMemo(
    () => filteredFees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredFees, page]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const classLabelById = new Map(
    classes.map((c) => [c.id, `${c.name}${c.section ? `-${c.section}` : ""}`])
  );

  const toSheetRows = (rows: FeeRecord[]) =>
    rows.map((f) => {
      const classLabel = f.student.class
        ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
        : "-";
      const status = f.remainingFee <= 0 ? "Paid" : "Pending";
      const discountAmount = Math.max((f.totalFee || 0) - (f.finalFee || 0), 0);
      return {
        "Student Name": f.student.user?.name || "-",
        "Admission Email": f.student.user?.email || "-",
        Class: classLabel,
        "Fee Type": f.feeTypes
          ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${f.feeTypeDueAmount.toLocaleString()})` : ""}`
          : "-",
        "Total Fee": f.totalFee,
        "Discount %": f.discountPercent,
        "Discount Amount": discountAmount,
        "Final Fee": f.finalFee,
        Paid: f.amountPaid,
        Pending: f.remainingFee,
        Status: status,
      };
    });

  const downloadExcel = (filename: string, rows: FeeRecord[]) => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(toSheetRows(rows));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fee Records");
    XLSX.writeFile(workbook, filename);
  };

  const getReportPeriodLabel = (value: ReportPeriod) => {
    if (value === "DAY_WISE") return "Day Wise";
    if (value === "MONTH_WISE") return "Month Wise";
    if (value === "YEAR_WISE") return "Year Wise";
    return "Academic Year Wise";
  };

  const getReportPeriodValue = () => {
    if (reportPeriod === "DAY_WISE") return reportDate || "-";
    if (reportPeriod === "MONTH_WISE") return reportMonth || "-";
    if (reportPeriod === "YEAR_WISE") return reportYear || "-";
    return academicYear || "-";
  };

  const toDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const inSelectedPeriod = (createdAt: string) => {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return false;
    if (reportPeriod === "DAY_WISE") {
      return toDateOnly(d).getTime() === toDateOnly(new Date(reportDate)).getTime();
    }
    if (reportPeriod === "MONTH_WISE") {
      const [y, m] = reportMonth.split("-").map((v) => Number(v));
      if (!y || !m) return false;
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    }
    if (reportPeriod === "YEAR_WISE") {
      return d.getFullYear() === Number(reportYear);
    }
    const [start, end] = academicYear.split("-").map((v) => Number(v));
    if (!start || !end) return false;
    const startDate = new Date(start, 3, 1); // 1 Apr
    const endDate = new Date(end, 2, 31, 23, 59, 59, 999); // 31 Mar
    return d >= startDate && d <= endDate;
  };

  const normalizeAccount = (feeTypeName?: string) => {
    const label = (feeTypeName || "").trim().replace(/\s+/g, " ");
    return label || "Default";
  };

  const accountKey = (label: string) => label.trim().replace(/\s+/g, " ").toUpperCase();

  const sortReportAccounts = (a: string, b: string) => {
    if (a === "Default") return -1;
    if (b === "Default") return 1;
    return a.localeCompare(b);
  };

  const normalizePaymentColumn = (gateway?: string): PaymentColumn => {
    const g = (gateway || "").toUpperCase();
    const normalized = g.startsWith("OFFLINE_") ? g.slice("OFFLINE_".length) : g;
    if (normalized === "CASH" || normalized === "OFFLINE") return "Cash";
    if (normalized === "CHEQUE") return "Cheque";
    if (normalized === "DD") return "DD";
    if (
      normalized === "HYPERPG" ||
      normalized === "ONLINE" ||
      normalized === "UPI" ||
      normalized === "BANK_TRANSFER" ||
      normalized === "BANK" ||
      normalized === "CARD"
    ) {
      return "ONLINE PAYMENT";
    }
    return "OTHERS";
  };

  const exportFinalTemplate = async () => {
    const workbook = XLSX.utils.book_new();

    const summaryRows: Array<Record<string, string | number>> = [
      { Field: "Report Type", Value: getReportPeriodLabel(reportPeriod) },
      { Field: "Report Parameter", Value: getReportPeriodValue() },
      { Field: "Class Filter", Value: selectedClass ? classLabelById.get(selectedClass) || "-" : "All Classes" },
      { Field: "Generated On", Value: new Date().toLocaleString("en-IN") },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Report Summary");
    const txRes = await fetch("/api/fees/transactions?limit=5000", { credentials: "include" });
    const txData = await txRes.json().catch(() => ({}));
    const transactions: Array<{
      amount: number;
      gateway?: string;
      createdAt: string;
      feeTypeName?: string;
      feeAllocations?: Array<{ name: string; amount: number }>;
      student?: { class?: { id?: string | null } | null } | null;
    }> = Array.isArray(txData?.transactions) ? txData.transactions : [];

    const filteredTx = transactions.filter((t) => {
      const classId = t.student?.class?.id || "";
      if (selectedClass && classId !== selectedClass) return false;
      return inSelectedPeriod(t.createdAt);
    });
    if (filteredTx.length === 0) {
      alert("No fee transactions found for the selected report period.");
      return;
    }

    const matrix = new Map<string, Record<PaymentColumn, number>>();
    const accountLabelByKey = new Map<string, string>();
    const initRow = (): Record<PaymentColumn, number> => ({
      Cash: 0,
      OTHERS: 0,
      "ONLINE PAYMENT": 0,
      Cheque: 0,
      DD: 0,
    });
    for (const tx of filteredTx) {
      const col = normalizePaymentColumn(tx.gateway);
      const allocations =
        Array.isArray(tx.feeAllocations) && tx.feeAllocations.length > 0
          ? tx.feeAllocations
          : [{ name: normalizeAccount(tx.feeTypeName), amount: Number(tx.amount || 0) }];
      for (const allocation of allocations) {
        const account = normalizeAccount(allocation.name);
        const key = accountKey(account);
        if (!accountLabelByKey.has(key)) accountLabelByKey.set(key, account);
        const row = matrix.get(key) ?? initRow();
        row[col] += Number(allocation.amount || 0);
        matrix.set(key, row);
      }
    }

    const reportRows: Array<{
      Accounts: string;
      Cash: number;
      OTHERS: number;
      "ONLINE PAYMENT": number;
      Cheque: number;
      DD: number;
      Total: number;
    }> = Array.from(accountLabelByKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => sortReportAccounts(a.label, b.label))
      .map(({ key, label }) => {
      const row = matrix.get(key) ?? initRow();
      const total = row.Cash + row.OTHERS + row["ONLINE PAYMENT"] + row.Cheque + row.DD;
      return {
        Accounts: label,
        Cash: Number(row.Cash.toFixed(2)),
        OTHERS: Number(row.OTHERS.toFixed(2)),
        "ONLINE PAYMENT": Number(row["ONLINE PAYMENT"].toFixed(2)),
        Cheque: Number(row.Cheque.toFixed(2)),
        DD: Number(row.DD.toFixed(2)),
        Total: Number(total.toFixed(2)),
      };
    });
    const grand = reportRows.reduce(
      (acc, r) => ({
        Cash: acc.Cash + r.Cash,
        OTHERS: acc.OTHERS + r.OTHERS,
        "ONLINE PAYMENT": acc["ONLINE PAYMENT"] + r["ONLINE PAYMENT"],
        Cheque: acc.Cheque + r.Cheque,
        DD: acc.DD + r.DD,
        Total: acc.Total + r.Total,
      }),
      { Cash: 0, OTHERS: 0, "ONLINE PAYMENT": 0, Cheque: 0, DD: 0, Total: 0 }
    );
    reportRows.push({
      Accounts: "Total",
      Cash: Number(grand.Cash.toFixed(2)),
      OTHERS: Number(grand.OTHERS.toFixed(2)),
      "ONLINE PAYMENT": Number(grand["ONLINE PAYMENT"].toFixed(2)),
      Cheque: Number(grand.Cheque.toFixed(2)),
      DD: Number(grand.DD.toFixed(2)),
      Total: Number(grand.Total.toFixed(2)),
    });
    const reportSheet = XLSX.utils.json_to_sheet(reportRows);
    XLSX.utils.book_append_sheet(workbook, reportSheet, "Fee Report");

    const recordsSheet = XLSX.utils.json_to_sheet(toSheetRows(filteredFees));
    XLSX.utils.book_append_sheet(workbook, recordsSheet, "Fee Records");

    const fileDate = new Date().toISOString().slice(0, 10);
    const safePeriod = reportPeriod.toLowerCase();
    XLSX.writeFile(workbook, `fee-report-${safePeriod}-${fileDate}.xlsx`);
  };

  const exportAllClasses = () => {
    if (fees.length === 0) {
      alert("No fee records available to export.");
      return;
    }
    downloadExcel(`fee-records-all-classes-${new Date().toISOString().slice(0, 10)}.xlsx`, fees);
  };

  const exportSelectedClass = () => {
    if (!selectedClass) {
      alert("Please select a class for class-wise export.");
      return;
    }
    const rows = fees.filter((f) => f.student.class?.id === selectedClass);
    if (rows.length === 0) {
      alert("No fee records found for the selected class.");
      return;
    }
    const className = classLabelById.get(selectedClass) || "class";
    const safeClassName = className.replaceAll(/[^\w-]+/g, "_");
    downloadExcel(
      `fee-records-${safeClassName}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      rows
    );
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold mb-4">
        {`Fee Records (${filteredFees.length}${
          filteredFees.length > PAGE_SIZE
            ? ` · rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredFees.length)}`
            : ""
        })`}
      </h3>
      <div className="mb-4 rounded-xl border border-white/10 bg-black/10 p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <SelectInput
            value={reportPeriod}
            onChange={(value) => setReportPeriod(value as ReportPeriod)}
            options={[
              { label: "Day Wise", value: "DAY_WISE" },
              { label: "Month Wise", value: "MONTH_WISE" },
              { label: "Year Wise", value: "YEAR_WISE" },
              { label: "Academic Year Wise", value: "ACADEMIC_YEAR_WISE" },
            ]}
          />
          {reportPeriod === "DAY_WISE" && (
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
            />
          )}
          {reportPeriod === "MONTH_WISE" && (
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
            />
          )}
          {reportPeriod === "YEAR_WISE" && (
            <input
              type="number"
              min={2000}
              max={2100}
              value={reportYear}
              onChange={(e) => setReportYear(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
              placeholder="e.g. 2026"
            />
          )}
          {reportPeriod === "ACADEMIC_YEAR_WISE" && (
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
              placeholder="e.g. 2025-2026"
            />
          )}
          <button
            type="button"
          onClick={() => void exportFinalTemplate()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/20"
          >
            <Download size={16} />
            Export Fee Report
          </button>
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Name or ID..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/20 border border-white/10 text-white"
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[220px]">
          <SelectInput
            value={selectedClass}
            onChange={setSelectedClass}
            options={[
              { label: "All Classes", value: "" },
              ...classes.map((c) => ({
                label: `${c.name}${c.section ? `-${c.section}` : ""}`,
                value: c.id,
              })),
            ]}
          />
        </div>
        <button
          type="button"
          onClick={exportAllClasses}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-2 text-sm text-lime-300 hover:bg-lime-500/20"
        >
          <Download size={16} />
          Export All Classes
        </button>
        <button
          type="button"
          onClick={exportSelectedClass}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/20"
        >
          <Download size={16} />
          Export Class-wise
        </button>
      </div>
      <div className="space-y-3 sm:hidden">
        {filteredFees.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-gray-400">
            No fee records found.
          </div>
        ) : (
          paginatedFees.map((f) => (
            <div key={f.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
              <button
                type="button"
                className="text-left text-base font-semibold text-white underline-offset-2 hover:underline"
                onMouseEnter={() => router.prefetch(schoolAdminStudentDetailsFeesUrl(f.student.id))}
                onClick={() => router.push(schoolAdminStudentDetailsFeesUrl(f.student.id))}
              >
                {f.student.user?.name || "-"}
              </button>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Class</span>
                  <span className="text-right text-white">
                    {f.student.class
                      ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
                      : "-"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-gray-400">Fee Type</span>
                  <span className="text-right text-gray-300">
                    {f.feeTypes
                      ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${f.feeTypeDueAmount.toLocaleString()})` : ""}`
                      : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Total</span>
                  <span className="text-white">₹{f.finalFee.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Discount</span>
                  <span className="text-cyan-300">
                    {f.discountPercent}% (₹{Math.max((f.totalFee || 0) - (f.finalFee || 0), 0).toLocaleString()})
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Paid</span>
                  <span className="text-emerald-400">₹{f.amountPaid.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Pending</span>
                  <span className="text-amber-400">₹{f.remainingFee.toLocaleString()}</span>
                </div>
                <div className="pt-1">
                  <span
                    className={`inline-flex rounded px-2 py-1 text-xs ${
                      f.remainingFee <= 0
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {f.remainingFee <= 0 ? "Paid" : "Pending"}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="-mx-4 hidden overflow-x-auto px-4 sm:block sm:mx-0 sm:px-0">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-white/10">
              <th className="py-3">Student</th>
              <th className="py-3">Class</th>
              <th className="py-3">Fee Type</th>
              <th className="py-3">Total</th>
              <th className="py-3">Discount</th>
              <th className="py-3">Paid</th>
              <th className="py-3">Pending</th>
              <th className="py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedFees.map((f) => (
              <tr key={f.id} className="border-b border-white/5">
                <td
                  className="py-3 cursor-pointer select-none underline-offset-2 hover:underline text-white/95"
                  title="Double-click to open student fee details"
                  onMouseEnter={() => router.prefetch(schoolAdminStudentDetailsFeesUrl(f.student.id))}
                  onDoubleClick={() => router.push(schoolAdminStudentDetailsFeesUrl(f.student.id))}
                >
                  {f.student.user?.name || "-"}
                </td>
                <td className="py-3">
                  {f.student.class
                    ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
                    : "-"}
                </td>
                <td className="py-3 text-gray-300">
                  {f.feeTypes
                    ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${f.feeTypeDueAmount.toLocaleString()})` : ""}`
                    : "-"}
                </td>
                <td className="py-3">₹{f.finalFee.toLocaleString()}</td>
                <td className="py-3 text-cyan-300">
                  {f.discountPercent}% (₹{Math.max((f.totalFee || 0) - (f.finalFee || 0), 0).toLocaleString()})
                </td>
                <td className="py-3 text-emerald-400">₹{f.amountPaid.toLocaleString()}</td>
                <td className="py-3 text-amber-400">₹{f.remainingFee.toLocaleString()}</td>
                <td className="py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      f.remainingFee <= 0
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {f.remainingFee <= 0 ? "Paid" : "Pending"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <InlinePagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </section>
  );
}
