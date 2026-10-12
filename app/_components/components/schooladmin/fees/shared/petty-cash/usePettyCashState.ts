import { useEffect, useMemo, useState } from "react";
import { downloadCsv, downloadExcel, downloadPdf } from "./pettyCashExport";
import { PAGE_SIZE, emptyForm, type FilterType, type FormState, type PettyCashExpense } from "./pettyCashTypes";
import {
  createPettyCashExpense,
  deletePettyCashExpense,
  fetchPettyCashExpenses,
  updatePettyCashExpense,
} from "@/lib/api/pettyCash";

export function usePettyCashState() {
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
      const { ok, data } = await fetchPettyCashExpenses();
      if (!ok) {
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
      const payload = {
        itemName: form.headOfAccount.trim(),
        headOfAccount: form.headOfAccount.trim(),
        paymentType: form.paymentType,
        amount,
        expenseDate: form.expenseDate,
        description: form.description.trim(),
      };
      const { ok, data } = editingId
        ? await updatePettyCashExpense(editingId, payload)
        : await createPettyCashExpense(payload);
      if (!ok) {
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
      const { ok, data } = await deletePettyCashExpense(row.id);
      if (!ok) {
        alert(data.message || "Failed to delete expense");
        return;
      }
      await fetchExpenses();
    } catch (error) {
      console.error(error);
      alert("Failed to delete expense");
    }
  };

  const handleExport = async (type: "pdf" | "excel" | "csv") => {
    setExportOpen(false);
    if (type === "csv") downloadCsv(filteredExpenses);
    if (type === "excel") downloadExcel(filteredExpenses);
    if (type === "pdf") await downloadPdf(filteredExpenses, filteredTotalAmount);
  };

  return {
    loading,
    saving,
    editingId,
    form,
    setForm,
    exportOpen,
    setExportOpen,
    page,
    setPage,
    filterType,
    setFilterType,
    filterDay,
    setFilterDay,
    filterWeek,
    setFilterWeek,
    filterMonth,
    setFilterMonth,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    totalAmount,
    filteredExpenses,
    filteredTotalAmount,
    totalPages,
    paginatedExpenses,
    resetForm,
    submit,
    onEdit,
    onDelete,
    handleExport,
  };
}
