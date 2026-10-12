import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { studentDetailsFeesUrlForPathname, studentDetailsUrlForPathname } from "../../../schooladmin/fees/studentDetailsNav";
import { formatClassOptionLabel, gradeSoughtFromClassName } from "@/lib/gradeFromClassName";
import type { AdmissionRow, FormState } from "./types";
import { defaultForm } from "./constants";
import { normalizeResidencyType } from "./utils";
import { useAdmissionFeeAssign } from "./useAdmissionFeeAssign";
import { useAdmissionReceiptPrinting } from "./useAdmissionReceiptPrinting";
import { useAdmissionTableColumns } from "./useAdmissionTableColumns";
import { useAdmissionPaymentDialog } from "./useAdmissionPaymentDialog";
import { useAdmissionListState } from "./useAdmissionListState";
import { useAdmissionFormEditLoad } from "./useAdmissionFormEditLoad";

export function useAdmissionTabState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") ?? "add") === "all" ? "all" : "add";
  const editId = searchParams.get("editId");
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<AdmissionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [classes, setClasses] = useState<{ id: string; name: string; section: string | null }[]>([]);

  const { receiptData, receiptRef, printFeeReceipt } = useAdmissionReceiptPrinting();

  const {
    rows,
    setRows,
    loading,
    page,
    setPage,
    totalPages,
    paidApplicationsCount,
    search,
    setSearch,
    filters,
    setFilters,
    listPhase,
    setListPhase,
    showExportMenu,
    setShowExportMenu,
    setReloadKey,
    exportAdmissions,
  } = useAdmissionListState({ view, setMessageTone, setMessage });

  const { paymentDialog, setPaymentDialog, paying, paymentError, paymentForm, setPaymentForm, openPaymentDialog, markFeePaid } =
    useAdmissionPaymentDialog({ setRows, setMessageTone, setMessage });

  const feeAssign = useAdmissionFeeAssign({ classes, pathname, router, setMessageTone, setMessage });

  const goToStudentDetails = useCallback(
    (row: AdmissionRow) => {
      if (!row.studentId) {
        setMessageTone("error");
        setMessage("Approve & enroll this application first to open Student Details.");
        return;
      }
      router.push(studentDetailsUrlForPathname(pathname, row.studentId));
    },
    [pathname, router]
  );

  const patchWorkflow = useCallback(async (row: AdmissionRow, workflowStatus: "PENDING" | "UPCOMING") => {
    setWorkflowBusyId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admissions/${row.id}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workflowStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to update status");
      setMessageTone("success");
      setMessage(data?.message || "Status updated");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setWorkflowBusyId(null);
    }
  }, [setReloadKey]);

  const enrollFromRow = useCallback(async (row: AdmissionRow) => {
    setWorkflowBusyId(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admissions/${row.id}/enroll`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Enrollment failed");
      const studentId = typeof data?.studentId === "string" ? data.studentId : null;
      setMessageTone("success");
      setMessage(
        studentId
          ? "Student created successfully. Opening student profile…"
          : data?.message || "Student created successfully"
      );
      if (studentId) {
        router.push(studentDetailsFeesUrlForPathname(pathname, studentId));
      } else {
        setReloadKey((k) => k + 1);
      }
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setWorkflowBusyId(null);
    }
  }, [pathname, router, setReloadKey]);

  useEffect(() => {
    fetch("/api/class/list?lite=1", { credentials: "include" })
      .then((res) => res.json())
      .then((d) => setClasses(Array.isArray(d?.classes) ? d.classes : []))
      .catch(() => setClasses([]));
  }, []);

  /** Only classes from `/api/class/list` — no hardcoded Grade 1…11 list. */
  const classOptions = useMemo(() => {
    const sorted = [...classes].sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }) ||
        String(a.section ?? "").localeCompare(String(b.section ?? ""), undefined, { numeric: true })
    );
    return [
      { label: "Unassigned", value: "" },
      ...sorted.map((c) => ({
        label: formatClassOptionLabel(c.name, c.section),
        value: c.id,
      })),
    ];
  }, [classes]);

  const onClassIdChange = useCallback(
    (classId: string) => {
      if (!classId) {
        setForm((p) => ({ ...p, classId: "" }));
        return;
      }
      const row = classes.find((c) => c.id === classId);
      setForm((p) => ({
        ...p,
        classId,
        gradeSought: row ? gradeSoughtFromClassName(row.name) : p.gradeSought,
      }));
    },
    [classes]
  );

  const { tableColumns } = useAdmissionTableColumns({
    workflowBusyId,
    setPaymentForm,
    setPaymentDialog,
    printFeeReceipt,
    enrollFromRow,
    warmAssignCatalog: feeAssign.warmAssignCatalog,
    openAssignFeesDialog: feeAssign.openAssignFeesDialog,
    router,
    setDeleteRow,
    goToStudentDetails,
  });

  useAdmissionFormEditLoad({ view, editId, setForm, setMessage, setMessageTone });

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admissions/${deleteRow.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to delete admission");
      setDeleteRow(null);
      setMessageTone("success");
      setMessage("Admission deleted successfully.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Failed to delete admission");
    } finally {
      setDeleting(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const aadharDigits = form.aadharNo.replace(/\D/g, "");
      const derivedParentAadhar =
        aadharDigits.length >= 8 ? `${aadharDigits.slice(0, 8)}0000` : `${aadharDigits.padEnd(8, "0")}0000`;
      const nameParts = form.studentName.trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] ?? "";
      const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : null;
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ".";
      const payload: Record<string, unknown> = {
        ...form,
        firstName,
        middleName,
        lastName,
        /** Explicit so mother name always reaches API (profile reads synced `Student.motherName` on save). */
        motherName: form.motherName?.trim() ? form.motherName.trim() : null,
        classId: form.classId || null,
        applicationFee: form.applicationFee.trim() ? Number(form.applicationFee) : null,
        admissionFee: form.admissionFee.trim() ? Number(form.admissionFee) : null,
        fedenaNo: form.fedenaNo || null,
        penNumber: form.penNumber?.trim() || null,
        apaarId: form.apaarId?.trim() || null,
        admissionNo: editId ? form.admissionNo?.trim() || null : null,
        caste: form.caste || null,
        religion: form.religion || null,
        houseNo: form.presentAddress.trim(),
        street: form.permanentAddress.trim(),
        city: form.presentAddress.trim() || "-",
        town: null,
        state: "-",
        pinCode: "000000",
        applicationNo: form.applicationNo.trim(),
        firstLanguage: form.firstLanguage?.trim() || "English",
        parentAadharNo: form.parentAadharNo?.trim() || derivedParentAadhar,
        previousSchoolName: form.previousSchoolName?.trim() || "-",
        previousSchoolAddress: form.previousSchoolAddress?.trim() || "-",
        residencyType: normalizeResidencyType(form.residencyType),
        emergencyFatherNo: form.parentPhone?.trim() || "-",
        emergencyMotherNo: form.motherPhone?.trim() || "-",
        emergencyGuardianNo: form.parentPhone?.trim() || "-",
      };
      const endpoint = editId ? `/api/admissions/${editId}` : "/api/admissions/create";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Failed to ${editId ? "update" : "save"} admission`);

      setMessageTone("success");
      if (editId) {
        setMessage("Admission updated successfully.");
      } else {
        setMessage(`Saved. Application No: ${data?.application?.applicationNo ?? "APP"}`);
        setForm(defaultForm());
      }
    } catch (e) {
      setMessageTone("error");
      const msg = e instanceof Error ? e.message : `Failed to ${editId ? "update" : "save"} admission`;
      setMessage(msg);
      throw new Error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveClick = async () => {
    try {
      await submit();
      router.push("?tab=admission&view=all");
    } catch {
      // Error message already set on the form; do not leave edit view on failed save.
    }
  };

  return {
    router,
    view,
    editId,
    form,
    setForm,
    submitting,
    message,
    messageTone,
    classes,
    classOptions,
    onClassIdChange,
    handleSaveClick,
    search,
    setSearch,
    filters,
    setFilters,
    showExportMenu,
    setShowExportMenu,
    exportAdmissions,
    listPhase,
    setListPhase,
    setPage,
    tableColumns,
    rows,
    loading,
    page,
    totalPages,
    paidApplicationsCount,
    goToStudentDetails,
    workflowBusyId,
    enrollFromRow,
    openPaymentDialog,
    setDeleteRow,
    deleteRow,
    deleting,
    confirmDelete,
    paymentDialog,
    setPaymentDialog,
    paymentForm,
    setPaymentForm,
    paymentError,
    paying,
    markFeePaid,
    printFeeReceipt,
    receiptData,
    receiptRef,
    feeAssign,
    patchWorkflow,
  };
}
