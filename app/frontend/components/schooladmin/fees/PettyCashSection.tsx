"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import PrimaryButton from "../../common/PrimaryButton";
import InlinePagination from "../schooladmincomponents/InlinePagination";

type PettyCashExpense = {
  id: string;
  voucherNo: number;
  itemName: string;
  headOfAccount?: string | null;
  paymentType?: string | null;
  amount: number;
  expenseDate: string;
  description: string | null;
  createdAt: string;
};

type FormState = {
  headOfAccount: string;
  paymentType: "CASH" | "ONLINE";
  amount: string;
  expenseDate: string;
  description: string;
};

type SchoolMeta = {
  name?: string;
  logoUrl?: string | null;
};

type FilterType = "ALL" | "DAY" | "WEEK" | "MONTH" | "RANGE";
const PAGE_SIZE = 10;

const emptyForm: FormState = {
  headOfAccount: "",
  paymentType: "CASH",
  amount: "",
  expenseDate: "",
  description: "",
};

const HEAD_OF_ACCOUNT_OPTIONS = [
  "Voucher",
  "Bill Cash",
  "Salary",
  "Transportation Charges",
  "Vehicle Maintenance",
  "Advances",
  "Stationary Expenses",
  "Refreshments",
  "Function Expenses",
  "Annual Maintenance Charges",
  "Fast Tag Recharge",
  "School Mobile Recharges",
  "Cheque Transfer",
];

export default function PettyCashSection() {
  const [expenses, setExpenses] = useState<PettyCashExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [exportOpen, setExportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<FilterType>("ALL");
  const [filterDay, setFilterDay] = useState(new Date().toISOString().slice(0, 10));
  const [filterWeek, setFilterWeek] = useState(() => {
    const now = new Date();
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - oneJan.getTime()) / 86400000);
    const weekNo = Math.ceil((days + oneJan.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  });
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fees/petty-cash", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to load petty cash records");
        return;
      }
      setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
    } catch (error) {
      console.error(error);
      alert("Failed to load petty cash records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchExpenses();
  }, []);

  const totalAmount = useMemo(
    () => expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [expenses]
  );

  const filteredExpenses = useMemo(() => {
    const parseLocal = (ymd: string) => {
      const [y, m, d] = ymd.split("-").map((v) => Number(v));
      if (!y || !m || !d) return null;
      return new Date(y, m - 1, d);
    };
    const parseWeek = (weekValue: string) => {
      const [yearPart, weekPart] = weekValue.split("-W");
      const year = Number(yearPart);
      const week = Number(weekPart);
      if (!year || !week) return null;
      const jan4 = new Date(year, 0, 4);
      const jan4Day = jan4.getDay() || 7;
      const mondayWeek1 = new Date(jan4);
      mondayWeek1.setDate(jan4.getDate() - jan4Day + 1);
      const start = new Date(mondayWeek1);
      start.setDate(mondayWeek1.getDate() + (week - 1) * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    };
    return expenses.filter((row) => {
      const d = new Date(row.expenseDate);
      if (Number.isNaN(d.getTime())) return false;
      if (filterType === "ALL") return true;
      if (filterType === "DAY") {
        const picked = parseLocal(filterDay);
        return picked ? d.toDateString() === picked.toDateString() : true;
      }
      if (filterType === "WEEK") {
        const range = parseWeek(filterWeek);
        return range ? d >= range.start && d <= range.end : true;
      }
      if (filterType === "MONTH") {
        const [y, m] = filterMonth.split("-").map((v) => Number(v));
        return !!(y && m) && d.getFullYear() === y && d.getMonth() + 1 === m;
      }
      const start = parseLocal(fromDate);
      const end = parseLocal(toDate);
      if (!start || !end) return true;
      const endWithTime = new Date(end);
      endWithTime.setHours(23, 59, 59, 999);
      return d >= start && d <= endWithTime;
    });
  }, [expenses, filterType, filterDay, filterWeek, filterMonth, fromDate, toDate]);

  const filteredTotalAmount = useMemo(
    () => filteredExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [filteredExpenses]
  );
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const paginatedExpenses = useMemo(
    () => filteredExpenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredExpenses, page]
  );

  useEffect(() => {
    setPage(1);
  }, [filterType, filterDay, filterWeek, filterMonth, fromDate, toDate, filteredExpenses.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submit = async () => {
    if (!form.headOfAccount.trim()) {
      alert("Head of account is required");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Amount must be a positive number");
      return;
    }
    if (!form.expenseDate) {
      alert("Expense date is required");
      return;
    }
    if (form.description.trim().length > 500) {
      alert("Description must be 500 characters or less");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/fees/petty-cash/${editingId}` : "/api/fees/petty-cash",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemName: form.headOfAccount.trim(),
            headOfAccount: form.headOfAccount.trim(),
            paymentType: form.paymentType,
            amount,
            expenseDate: form.expenseDate,
            description: form.description.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to save expense");
        return;
      }

      resetForm();
      await fetchExpenses();
    } catch (error) {
      console.error(error);
      alert("Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row: PettyCashExpense) => {
    setEditingId(row.id);
    setForm({
      headOfAccount: row.headOfAccount || row.itemName,
      paymentType: (row.paymentType || "CASH") as "CASH" | "ONLINE",
      amount: String(row.amount),
      expenseDate: row.expenseDate?.slice(0, 10) ?? "",
      description: row.description ?? "",
    });
  };

  const onDelete = async (row: PettyCashExpense) => {
    if (!confirm(`Delete voucher #${row.voucherNo} (${row.itemName})?`)) return;
    try {
      const res = await fetch(`/api/fees/petty-cash/${row.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to delete expense");
        return;
      }
      await fetchExpenses();
    } catch (error) {
      console.error(error);
      alert("Failed to delete expense");
    }
  };

  const toRows = (rows: PettyCashExpense[]) =>
    rows.map((row) => ({
      "Voucher No": `VCH-${row.voucherNo}`,
      Date: new Date(row.expenseDate).toLocaleDateString("en-IN"),
      "Head of Account": row.headOfAccount || row.itemName,
      "Type of Voucher": row.paymentType || "CASH",
      "Amount (INR)": Number(row.amount),
      Description: row.description || "",
    }));

  const downloadCsv = () => {
    if (filteredExpenses.length === 0) {
      alert("No petty cash records to export.");
      return;
    }
    const rows = toRows(filteredExpenses);
    const headers = Object.keys(rows[0]);
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => escapeCsv((row as Record<string, string | number>)[h])).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `petty-cash-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    if (filteredExpenses.length === 0) {
      alert("No petty cash records to export.");
      return;
    }
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(toRows(filteredExpenses));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Petty Cash");
    XLSX.writeFile(workbook, `petty-cash-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getSchoolMeta = async (): Promise<SchoolMeta> => {
    try {
      const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      return {
        name: data?.school?.name || "School",
        logoUrl: data?.school?.logoUrl || data?.school?.admins?.[0]?.photoUrl || null,
      };
    } catch {
      return { name: "School", logoUrl: null };
    }
  };

  const loadImageAsDataUrl = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const downloadPdf = async () => {
    if (filteredExpenses.length === 0) {
      alert("No petty cash records to export.");
      return;
    }

    const schoolMeta = await getSchoolMeta();
    const logoDataUrl = schoolMeta.logoUrl ? await loadImageAsDataUrl(schoolMeta.logoUrl) : null;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;

    doc.setFillColor(24, 31, 46);
    doc.rect(0, 0, pageWidth, 34, "F");
    doc.setFillColor(132, 204, 22);
    doc.rect(0, 34, pageWidth, 2, "F");

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", margin, 7, 18, 18);
      } catch {
        // ignore logo rendering failures
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(schoolMeta.name || "School", logoDataUrl ? margin + 23 : margin, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Petty Cash Expense Report", logoDataUrl ? margin + 23 : margin, 20);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, logoDataUrl ? margin + 23 : margin, 26);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(`Total Expenses: INR ${filteredTotalAmount.toLocaleString()}`, pageWidth - margin, 20, { align: "right" });
    doc.text(`Entries: ${filteredExpenses.length}`, pageWidth - margin, 26, { align: "right" });

    let y = 44;
    const headers = ["Date", "Head of Account", "Description", "Voucher No", "Type", "Amount (INR)"];
    const colWidths = [24, 46, 52, 24, 18, 22];
    const headerRowHeight = 7;
    const minDataRowHeight = 7;
    const cellTopPadMm = 4.8;

    const drawHeader = () => {
      doc.setFillColor(132, 204, 22);
      doc.rect(margin, y, pageWidth - margin * 2, headerRowHeight, "F");
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      let x = margin + 1.5;
      headers.forEach((h, idx) => {
        doc.text(h, x, y + 4.8);
        x += colWidths[idx];
      });
      y += headerRowHeight;
    };

    drawHeader();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);

    const lineHeightMm =
      (typeof doc.getLineHeightFactor === "function" ? doc.getLineHeightFactor() : 1.15) *
      doc.getFontSize() *
      0.352778;

    for (let i = 0; i < filteredExpenses.length; i += 1) {
      const row = filteredExpenses[i];
      const dateStr = new Date(row.expenseDate).toLocaleDateString("en-IN");
      const headStr = String(row.headOfAccount || row.itemName);
      const descStr = String(row.description || "-");
      const voucherStr = String(row.voucherNo);
      const typeStr = String(row.paymentType || "CASH");
      const amountStr = `INR ${Number(row.amount).toLocaleString()}`;

      const headLines = doc.splitTextToSize(headStr, colWidths[1] - 2);
      const descLines = doc.splitTextToSize(descStr, colWidths[2] - 2);
      const maxWrapLines = Math.max(1, headLines.length, descLines.length);
      const rowHeight = Math.max(minDataRowHeight, cellTopPadMm + maxWrapLines * lineHeightMm + 1);

      if (y + rowHeight > pageHeight - 16) {
        doc.addPage();
        y = 14;
        drawHeader();
      }

      if (i % 2 === 0) {
        doc.setFillColor(246, 247, 250);
        doc.rect(margin, y, pageWidth - margin * 2, rowHeight, "F");
      }

      doc.setTextColor(30, 30, 30);
      let x = margin + 1.5;

      doc.text(dateStr, x, y + cellTopPadMm, { maxWidth: colWidths[0] - 2 });
      x += colWidths[0];

      doc.text(headLines, x, y + cellTopPadMm);
      x += colWidths[1];

      doc.text(descLines, x, y + cellTopPadMm);
      x += colWidths[2];

      doc.text(voucherStr, x, y + cellTopPadMm, { maxWidth: colWidths[3] - 2 });
      x += colWidths[3];

      doc.text(typeStr, x, y + cellTopPadMm, { maxWidth: colWidths[4] - 2 });
      x += colWidths[4];

      doc.text(amountStr, x, y + cellTopPadMm, { maxWidth: colWidths[5] - 2 });

      y += rowHeight;
    }

    doc.save(`petty-cash-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleExport = async (type: "pdf" | "excel" | "csv") => {
    setExportOpen(false);
    if (type === "csv") downloadCsv();
    if (type === "excel") downloadExcel();
    if (type === "pdf") await downloadPdf();
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold">Petty Cash</h3>
      <p className="mt-1 text-sm text-gray-400">
        Store school expense records with Date, Head of Account, Description, Voucher No, and Cash/Online type.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-white/70">Head of Account</label>
          <select
            value={form.headOfAccount}
            onChange={(e) => setForm((prev) => ({ ...prev, headOfAccount: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
          >
            <option value="">Select head</option>
            {HEAD_OF_ACCOUNT_OPTIONS.map((head) => (
              <option key={head} value={head}>
                {head}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/70">Amount (INR)</label>
          <input
            type="number"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
            placeholder="0"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/70">Expense Date</label>
          <input
            type="date"
            value={form.expenseDate}
            onChange={(e) => setForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/70">Type of Voucher</label>
          <select
            value={form.paymentType}
            onChange={(e) => setForm((prev) => ({ ...prev, paymentType: e.target.value as "CASH" | "ONLINE" }))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
          >
            <option value="CASH">Cash</option>
            <option value="ONLINE">Online</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-white/70">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full min-h-[160px] rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
            placeholder="Notes / vendor / purpose"
            maxLength={1000}
            rows={6}
          />
          <p className="mt-1 text-[11px] text-white/45">{form.description.length}/1000</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PrimaryButton
          title={saving ? "Saving..." : editingId ? "Update Expense" : "Add Expense"}
          loading={saving}
          onClick={submit}
        />
        {editingId ? (
          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-white/20 px-4 py-2"
          >
            Cancel Edit
          </button>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 p-3 text-sm">
        <div>
          <span className="text-white/70">Filtered Total:</span>{" "}
          <span className="font-semibold text-white">INR {filteredTotalAmount.toLocaleString()}</span>
          <span className="mx-2 text-white/30">|</span>
          <span className="text-white/70">All Time:</span>{" "}
          <span className="font-semibold text-white">INR {totalAmount.toLocaleString()}</span>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-2 text-sm text-lime-300 hover:bg-lime-500/20"
          >
            <Download size={16} />
            Export
          </button>
          {exportOpen ? (
            <div className="absolute right-0 z-20 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-white/15 bg-[#151525] shadow-xl">
              <button
                type="button"
                onClick={() => void handleExport("pdf")}
                className="block w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              >
                Export as PDF
              </button>
              <button
                type="button"
                onClick={() => void handleExport("excel")}
                className="block w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              >
                Export as Excel
              </button>
              <button
                type="button"
                onClick={() => void handleExport("csv")}
                className="block w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              >
                Export as CSV
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-black/10 p-3 md:grid-cols-5">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as FilterType)}
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
        >
          <option value="ALL">All</option>
          <option value="DAY">Day</option>
          <option value="WEEK">Week</option>
          <option value="MONTH">Month</option>
          <option value="RANGE">Date Range</option>
        </select>
        {filterType === "DAY" ? (
          <input
            type="date"
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          />
        ) : null}
        {filterType === "WEEK" ? (
          <input
            type="week"
            value={filterWeek}
            onChange={(e) => setFilterWeek(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          />
        ) : null}
        {filterType === "MONTH" ? (
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          />
        ) : null}
        {filterType === "RANGE" ? (
          <>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
            />
          </>
        ) : null}
        <div className="flex items-center justify-end text-xs text-white/60 md:col-span-2">
          Showing {filteredExpenses.length} record(s)
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading petty cash records...</p>
      ) : filteredExpenses.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No expenses recorded yet.</p>
      ) : (
        <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-gray-400">
                <th className="py-3">Date</th>
                <th className="py-3">Head of Account</th>
                <th className="py-3">Description</th>
                <th className="py-3">Voucher No</th>
                <th className="py-3">Type</th>
                <th className="py-3">Amount (INR)</th>
                <th className="w-24 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedExpenses.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-3 text-white/85">
                    {new Date(row.expenseDate).toLocaleDateString("en-IN")}
                  </td>
                  <td className="py-3 text-white">{row.headOfAccount || row.itemName}</td>
                  <td className="max-w-[460px] py-3 text-white/70 align-top whitespace-pre-wrap break-words">
                    {row.description || "-"}
                  </td>
                  <td className="py-3 font-medium text-lime-300">{`VCR-${row.voucherNo}`}</td>
                  <td className="py-3 text-white/85">{row.paymentType || "CASH"}</td>
                  <td className="py-3 text-white">₹{Number(row.amount).toLocaleString()}</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        className="rounded-lg p-1.5 hover:bg-white/10"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/20"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && filteredExpenses.length > 0 ? (
        <div className="mt-4">
          <InlinePagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      ) : null}
    </section>
  );
}
