"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import * as XLSX from "xlsx";
import SelectInput from "../../common/SelectInput";
import type { Class, FeeRecord } from "./types";
import { schoolAdminStudentDetailsFeesUrl } from "./studentDetailsNav";

interface FeeRecordsTableProps {
  fees: FeeRecord[];
  classes: Class[];
}

export default function FeeRecordsTable({ fees, classes }: FeeRecordsTableProps) {
  const router = useRouter();
  const [searchName, setSearchName] = useState("");
  const [selectedClass, setSelectedClass] = useState("");

  const filteredFees = fees.filter((f) => {
    const name = (f.student.user?.name || "").toLowerCase();
    const q = searchName.toLowerCase();
    if (q && !name.includes(q)) return false;
    if (selectedClass && f.student.class?.id !== selectedClass) return false;
    return true;
  });

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
      <h3 className="text-lg font-semibold mb-4">Fee Records ({filteredFees.length})</h3>
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
          filteredFees.map((f) => (
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
            {filteredFees.map((f) => (
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
    </section>
  );
}
