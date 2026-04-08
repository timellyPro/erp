"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Download, FileText, Pencil, PlusCircle, Save, Search, Trash2 } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import PageTabs from "../../schooladmin/schooladmincomponents/PageHeaderTabs";
import InputField from "../../schooladmin/schooladmincomponents/InputField";
import DataTable from "../../common/TableLayout";
import SearchInput from "../../common/SearchInput";
import { generatePDF } from "@/lib/pdfUtils";
import AdmissionReceiptTemplate, { type AdmissionReceiptData } from "../../pdf/AdmissionReceiptTemplate";

type Gender = "MALE" | "FEMALE";
type BoardingType = "SEMI_RESIDENTIAL" | "REGULAR_BOARDER";
type Grade =
  | "LKG"
  | "UKG"
  | "GRADE_1"
  | "GRADE_2"
  | "GRADE_3"
  | "GRADE_4"
  | "GRADE_5"
  | "GRADE_6"
  | "GRADE_7"
  | "GRADE_8"
  | "GRADE_9"
  | "GRADE_10";

type AdmissionRow = {
  id: string;
  applicationNo: string;
  admissionNo: string | null;
  fedenaNo: string | null;
  classId?: string | null;
  class?: { id: string; name: string; section: string | null } | null;
  gradeSought: Grade;
  boardingType: BoardingType;
  residencyType?: string | null;
  totalFee?: number | null;
  discountPercent?: number | null;
  applicationFee?: number | null;
  admissionFee?: number | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: Gender;
  dateOfBirth: string;
  aadharNo: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  city: string;
  state: string;
  pinCode: string;
  createdAt: string;
};

type FormState = {
  applicationNo: string;
  fedenaNo: string;
  admissionNo: string;
  classId: string;
  gradeSought: Grade;
  boardingType: BoardingType;
  residencyType: string;
  totalFee: string;
  discountPercent: string;
  applicationFee: string;
  admissionFee: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: string; // yyyy-mm-dd
  aadharNo: string;
  firstLanguage: string;
  nationality: string;
  languagesAtHome: string;
  caste: string;
  religion: string;
  houseNo: string;
  street: string;
  city: string;
  town: string;
  state: string;
  pinCode: string;
  parentName: string;
  parentOccupation: string;
  officeAddress: string;
  parentPhone: string;
  parentEmail: string;
  parentAadharNo: string;
  parentWhatsapp: string;
  bankAccountNo: string;
  previousSchoolName: string;
  previousSchoolAddress: string;
  emergencyFatherNo: string;
  emergencyMotherNo: string;
  emergencyGuardianNo: string;
};

const GRADES: { label: string; value: Grade }[] = [
  { label: "LKG", value: "LKG" },
  { label: "UKG", value: "UKG" },
  { label: "Grade 1", value: "GRADE_1" },
  { label: "Grade 2", value: "GRADE_2" },
  { label: "Grade 3", value: "GRADE_3" },
  { label: "Grade 4", value: "GRADE_4" },
  { label: "Grade 5", value: "GRADE_5" },
  { label: "Grade 6", value: "GRADE_6" },
  { label: "Grade 7", value: "GRADE_7" },
  { label: "Grade 8", value: "GRADE_8" },
  { label: "Grade 9", value: "GRADE_9" },
  { label: "Grade 10", value: "GRADE_10" },
];

const BOARDING: { label: string; value: BoardingType }[] = [
  { label: "Semi Residential", value: "SEMI_RESIDENTIAL" },
  { label: "Regular Boarder", value: "REGULAR_BOARDER" },
];

const GENDERS: { label: string; value: Gender }[] = [
  { label: "Male", value: "MALE" },
  { label: "Female", value: "FEMALE" },
];

const defaultForm = (): FormState => ({
  applicationNo: "",
  fedenaNo: "",
  admissionNo: "",
  classId: "",
  gradeSought: "GRADE_1",
  boardingType: "SEMI_RESIDENTIAL",
  residencyType: "Day Scholar",
  totalFee: "",
  discountPercent: "0",
  applicationFee: "",
  admissionFee: "",
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "MALE",
  dateOfBirth: "",
  aadharNo: "",
  firstLanguage: "",
  nationality: "Indian",
  languagesAtHome: "",
  caste: "",
  religion: "",
  houseNo: "",
  street: "",
  city: "",
  town: "",
  state: "",
  pinCode: "",
  parentName: "",
  parentOccupation: "",
  officeAddress: "",
  parentPhone: "",
  parentEmail: "",
  parentAadharNo: "",
  parentWhatsapp: "",
  bankAccountNo: "",
  previousSchoolName: "",
  previousSchoolAddress: "",
  emergencyFatherNo: "",
  emergencyMotherNo: "",
  emergencyGuardianNo: "",
});

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/70 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-lime-400/50 text-gray-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <div className="text-sm font-semibold text-white/90">{title}</div>;
}

function formatInrCell(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `₹ ${Number(n).toLocaleString("en-IN")}`;
}

function normalizeResidencyType(value: string | null | undefined): string {
  const v = (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!v) return "Day Scholar";
  if (v === "dayscholar" || v === "dayscholer") return "Day Scholar";
  if (v === "hostler" || v === "hosteler" || v === "hosteller" || v === "hoster") return "Hosteller";
  return value?.trim() || "Day Scholar";
}

export default function TeacherAdmissionTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") ?? "add") === "all" ? "all" : "add";
  const editId = searchParams.get("editId");
  const [form, setForm] = useState<FormState>(() => defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  const [rows, setRows] = useState<AdmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<{ gradeSought: string; boardingType: string; from: string; to: string; classId: string }>({
    gradeSought: "",
    boardingType: "",
    from: "",
    to: "",
    classId: "",
  });

  const [reloadKey, setReloadKey] = useState(0);
  const [deleteRow, setDeleteRow] = useState<AdmissionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [classes, setClasses] = useState<{ id: string; name: string; section: string | null }[]>([]);
  const [selectedClassName, setSelectedClassName] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [receiptData, setReceiptData] = useState<AdmissionReceiptData | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/school/mine", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then((d) => {
        setSchoolName(typeof d?.school?.name === "string" ? d.school.name : "");
        const address = [d?.school?.address, d?.school?.location].filter((v: any) => typeof v === "string" && v.trim()).join(", ");
        setSchoolAddress(address);
      })
      .catch(() => {
        setSchoolName("");
        setSchoolAddress("");
      });
  }, []);

  const downloadFeeReceipt = async (r: AdmissionRow) => {
    const app = Number(r.applicationFee ?? 0);
    const adm = Number(r.admissionFee ?? 0);
    const data: AdmissionReceiptData = {
      schoolName: schoolName || "School",
      schoolAddress: schoolAddress || "-",
      applicationNo: r.applicationNo || "-",
      studentName: `${r.firstName} ${r.lastName}`.trim() || "Student",
      className: r.class ? `${r.class.name}${r.class.section ? `-${r.class.section}` : ""}` : r.gradeSought,
      gradeSought: r.gradeSought,
      boardingType: r.boardingType,
      residencyType: normalizeResidencyType(r.residencyType),
      parentName: r.parentName || "-",
      parentPhone: r.parentPhone || "-",
      createdAt: new Date(r.createdAt).toLocaleString(),
      applicationFee: app,
      admissionFee: adm,
      total: app + adm,
    };

    setReceiptData(data);
    setTimeout(async () => {
      await generatePDF(receiptRef, `fee-receipt-${(r.applicationNo || "APP").replace(/[^\w-]+/g, "_")}.pdf`);
    }, 200);
  };

  useEffect(() => {
    fetch("/api/class/list")
      .then((res) => res.json())
      .then((d) => setClasses(Array.isArray(d?.classes) ? d.classes : []))
      .catch(() => setClasses([]));
  }, []);

  const classNameOptions = useMemo(() => {
    const names = Array.from(new Set(classes.map((c) => c.name).filter(Boolean)));
    return [{ label: "Unassigned", value: "" }, ...names.map((n) => ({ label: n, value: n }))];
  }, [classes]);

  const sectionOptions = useMemo(() => {
    if (!selectedClassName) return [{ label: "Select class first", value: "" }];
    const sections = Array.from(
      new Set(
        classes
          .filter((c) => c.name === selectedClassName)
          .map((c) => c.section)
          .filter((s): s is string => Boolean(s && String(s).trim()))
      )
    );
    if (sections.length === 0) return [{ label: "No sections", value: "" }];
    return [{ label: "Select Section", value: "" }, ...sections.map((s) => ({ label: s, value: s }))];
  }, [classes, selectedClassName]);

  useEffect(() => {
    if (!selectedClassName) {
      setForm((p) => ({ ...p, classId: "" }));
      setSelectedSection("");
      return;
    }

    const candidates = classes.filter((c) => c.name === selectedClassName);
    if (candidates.length === 1) {
      setForm((p) => ({ ...p, classId: candidates[0].id }));
      setSelectedSection(candidates[0].section ?? "");
      return;
    }

    const match = candidates.find((c) => (c.section ?? "") === selectedSection);
    setForm((p) => ({ ...p, classId: match?.id ?? "" }));
  }, [classes, selectedClassName, selectedSection]);

  const tableColumns: any[] = useMemo(
    () => [
      { header: "Student", render: (r: AdmissionRow) => <span className="text-sm text-white/80">{`${r.firstName} ${r.lastName}`}</span> },
      { header: "Grade", render: (r: AdmissionRow) => <span className="text-sm text-white/70">{r.gradeSought}</span> },
      { header: "Boarding", render: (r: AdmissionRow) => <span className="text-sm text-white/70">{r.boardingType}</span> },
      { header: "Residency", render: (r: AdmissionRow) => <span className="text-sm text-white/70">{normalizeResidencyType(r.residencyType)}</span> },
      { header: "Parent Phone", render: (r: AdmissionRow) => <span className="text-sm text-white/70">{r.parentPhone}</span> },
      {
        header: "Application Fee",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/70">{formatInrCell(r.applicationFee)}</span>
        ),
      },
      {
        header: "Admission Fee",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/70">{formatInrCell(r.admissionFee)}</span>
        ),
      },
      { header: "Created", render: (r: AdmissionRow) => <span className="text-sm text-white/60">{new Date(r.createdAt).toLocaleDateString()}</span> },
      {
        header: "Actions",
        render: (r: AdmissionRow) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                downloadFeeReceipt(r)
              }
              className="p-2 rounded-lg bg-lime-400/10 border border-lime-400/25 text-lime-300 hover:bg-lime-400/20"
              title="Download fee receipt (PDF)"
            >
              <FileText size={14} />
            </button>
            <button
              type="button"
              onClick={() => router.push(`?tab=admission&view=add&editId=${r.id}`)}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
              title="Edit application"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteRow(r)}
              className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20"
              title="Delete application"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
      },
    ],
    [router, schoolName]
  );

  useEffect(() => {
    if (view !== "all") return;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (search.trim()) params.set("search", search.trim());
    if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
    if (filters.boardingType) params.set("boardingType", filters.boardingType);
    if (filters.classId) params.set("classId", filters.classId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    setLoading(true);
    fetch(`/api/admissions/list?${params.toString()}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.message || "Failed to load admissions");
        setRows(Array.isArray(d?.applications) ? d.applications : []);
        const total = Number(d?.total ?? 0);
        const pageSize = Number(d?.pageSize ?? 10);
        const computed = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
        setTotalPages(computed);
        setPage((p) => Math.min(p, computed));
      })
      .catch((e) => {
        setRows([]);
        setTotalPages(1);
        setMessageTone("error");
        setMessage(e instanceof Error ? e.message : "Failed to load admissions");
      })
      .finally(() => setLoading(false));
  }, [view, page, search, filters.gradeSought, filters.boardingType, filters.classId, filters.from, filters.to, reloadKey]);

  useEffect(() => {
    if (view !== "add" || !editId) return;
    let active = true;
    setMessage(null);
    fetch(`/api/admissions/${editId}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.message || "Failed to load admission");
        const a = d?.application;
        if (!a || !active) return;
        setForm({
          applicationNo: a.applicationNo ?? "",
          fedenaNo: a.fedenaNo ?? "",
          admissionNo: a.admissionNo ?? "",
          classId: a.classId ?? "",
          gradeSought: a.gradeSought,
          boardingType: a.boardingType,
          residencyType: normalizeResidencyType(a.residencyType),
          totalFee: a.totalFee === null || a.totalFee === undefined ? "" : String(a.totalFee),
          discountPercent:
            a.discountPercent === null || a.discountPercent === undefined ? "0" : String(a.discountPercent),
          applicationFee:
            a.applicationFee === null || a.applicationFee === undefined ? "" : String(a.applicationFee),
          admissionFee: a.admissionFee === null || a.admissionFee === undefined ? "" : String(a.admissionFee),
          firstName: a.firstName ?? "",
          middleName: a.middleName ?? "",
          lastName: a.lastName ?? "",
          gender: a.gender,
          dateOfBirth: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : "",
          aadharNo: a.aadharNo ?? "",
          firstLanguage: a.firstLanguage ?? "",
          nationality: a.nationality ?? "Indian",
          languagesAtHome: a.languagesAtHome ?? "",
          caste: a.caste ?? "",
          religion: a.religion ?? "",
          houseNo: a.houseNo ?? "",
          street: a.street ?? "",
          city: a.city ?? "",
          town: a.town ?? "",
          state: a.state ?? "",
          pinCode: a.pinCode ?? "",
          parentName: a.parentName ?? "",
          parentOccupation: a.parentOccupation ?? "",
          officeAddress: a.officeAddress ?? "",
          parentPhone: a.parentPhone ?? "",
          parentEmail: a.parentEmail ?? "",
          parentAadharNo: a.parentAadharNo ?? "",
          parentWhatsapp: a.parentWhatsapp ?? "",
          bankAccountNo: a.bankAccountNo ?? "",
          previousSchoolName: a.previousSchoolName ?? "",
          previousSchoolAddress: a.previousSchoolAddress ?? "",
          emergencyFatherNo: a.emergencyFatherNo ?? "",
          emergencyMotherNo: a.emergencyMotherNo ?? "",
          emergencyGuardianNo: a.emergencyGuardianNo ?? "",
        });
        if (a.class?.name) {
          setSelectedClassName(a.class.name);
          setSelectedSection(a.class?.section ?? "");
        } else {
          setSelectedClassName("");
          setSelectedSection("");
        }
      })
      .catch((e) => {
        if (!active) return;
        setMessageTone("error");
        setMessage(e instanceof Error ? e.message : "Failed to load admission");
      });
    return () => {
      active = false;
    };
  }, [view, editId]);

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admissions/${deleteRow.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.message || "Failed to delete admission");
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
      const payload: any = {
        ...form,
        classId: form.classId || null,
        totalFee: form.totalFee || null,
        discountPercent: form.discountPercent || null,
        applicationFee: form.applicationFee.trim() ? Number(form.applicationFee) : null,
        admissionFee: form.admissionFee.trim() ? Number(form.admissionFee) : null,
        fedenaNo: form.fedenaNo || null,
        admissionNo: editId ? form.admissionNo?.trim() || null : null,
        middleName: form.middleName || null,
        caste: form.caste || null,
        religion: form.religion || null,
        town: form.town || null,
        applicationNo: editId ? form.applicationNo || undefined : null,
        firstLanguage: form.firstLanguage?.trim() || "English",
        parentAadharNo: form.parentAadharNo?.trim() || derivedParentAadhar,
        previousSchoolName: form.previousSchoolName?.trim() || "-",
        previousSchoolAddress: form.previousSchoolAddress?.trim() || "-",
        residencyType: normalizeResidencyType(form.residencyType),
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
      setMessage(e instanceof Error ? e.message : `Failed to ${editId ? "update" : "save"} admission`);
    } finally {
      setSubmitting(false);
    }
  };

  const exportExcel = async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
    if (filters.boardingType) params.set("boardingType", filters.boardingType);
    if (filters.classId) params.set("classId", filters.classId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);

    const res = await fetch(`/api/admissions/export?${params.toString()}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as any)?.message || "Export failed");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admissions-${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Admission"
        subtitle="Create student admission applications, filter, and export to Excel."
        rightSlot={
          <PageTabs
            tabs={[
              { label: "New Application", value: "add" },
              { label: "Applications", value: "all" },
            ]}
            queryKey="view"
          />
        }
      />

      <div className="space-y-6">
        {view === "add" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-lime-400" />
                  <div className="text-white font-semibold">
                    {editId ? "Edit Admission Application" : "Admission Form"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editId && (
                    <button
                      type="button"
                      onClick={() => router.push("?tab=admission&view=all")}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 font-semibold hover:bg-white/10"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await submit();
                        if (editId) router.push("?tab=admission&view=all");
                      } catch {}
                    }}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-lime-400 text-black font-semibold hover:bg-lime-500 disabled:opacity-60 flex items-center gap-2"
                  >
                    <Save size={16} />
                    {submitting ? "Saving..." : editId ? "Update" : "Save"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InputField
                  label="Fedena No (optional)"
                  value={form.fedenaNo}
                  onChange={(v) => setForm((p) => ({ ...p, fedenaNo: v }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Select
                  label="Grade Sought"
                  value={form.gradeSought}
                  onChange={(v) => setForm((p) => ({ ...p, gradeSought: v as Grade }))}
                  options={GRADES}
                />
                <Select
                  label="Boarding Type"
                  value={form.boardingType}
                  onChange={(v) => setForm((p) => ({ ...p, boardingType: v as BoardingType }))}
                  options={BOARDING}
                />
                <Select
                  label="Residency Type"
                  value={form.residencyType}
                  onChange={(v) => setForm((p) => ({ ...p, residencyType: v }))}
                  options={[
                    { label: "Day Scholar", value: "Day Scholar" },
                    { label: "Hosteller", value: "Hosteller" },
                  ]}
                />
                <Select
                  label="Gender"
                  value={form.gender}
                  onChange={(v) => setForm((p) => ({ ...p, gender: v as Gender }))}
                  options={GENDERS}
                />
                <Select
                  label="Class"
                  value={selectedClassName}
                  onChange={(v) => setSelectedClassName(v)}
                  options={classNameOptions}
                />
              </div>

              {selectedClassName && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Select
                    label="Section"
                    value={selectedSection}
                    onChange={(v) => setSelectedSection(v)}
                    options={sectionOptions}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InputField
                  label="First Name"
                  value={form.firstName}
                  onChange={(v) => setForm((p) => ({ ...p, firstName: v }))}
                  required
                />
                <InputField
                  label="Middle Name (optional)"
                  value={form.middleName}
                  onChange={(v) => setForm((p) => ({ ...p, middleName: v }))}
                />
                <InputField
                  label="Last Name"
                  value={form.lastName}
                  onChange={(v) => setForm((p) => ({ ...p, lastName: v }))}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <InputField
                  label="Date of Birth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(v) => setForm((p) => ({ ...p, dateOfBirth: v }))}
                  required
                />
                <InputField
                  label="Aadhar No"
                  value={form.aadharNo}
                  onChange={(v) => setForm((p) => ({ ...p, aadharNo: v }))}
                  required
                />
                <InputField
                  label="Total Fee (optional)"
                  value={form.totalFee}
                  onChange={(v) => setForm((p) => ({ ...p, totalFee: v }))}
                  placeholder="e.g. 30000"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <InputField
                  label="Discount % (optional)"
                  value={form.discountPercent}
                  onChange={(v) => setForm((p) => ({ ...p, discountPercent: v }))}
                  placeholder="0-100"
                />
                <InputField
                  label="Application Fee (optional, record only)"
                  value={form.applicationFee}
                  onChange={(v) => setForm((p) => ({ ...p, applicationFee: v }))}
                  placeholder="e.g. 500"
                />
                <InputField
                  label="Admission Fee (optional, record only)"
                  value={form.admissionFee}
                  onChange={(v) => setForm((p) => ({ ...p, admissionFee: v }))}
                  placeholder="e.g. 5000"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InputField
                  label="Nationality"
                  value={form.nationality}
                  onChange={(v) => setForm((p) => ({ ...p, nationality: v }))}
                  required
                />
                <InputField
                  label="Languages at Home"
                  value={form.languagesAtHome}
                  onChange={(v) => setForm((p) => ({ ...p, languagesAtHome: v }))}
                  required
                />
                <InputField
                  label="Caste (optional)"
                  value={form.caste}
                  onChange={(v) => setForm((p) => ({ ...p, caste: v }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InputField
                  label="Religion (optional)"
                  value={form.religion}
                  onChange={(v) => setForm((p) => ({ ...p, religion: v }))}
                />
              </div>

              <div className="pt-2 border-t border-white/10 space-y-4">
                <SectionTitle title="Address" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField label="House No" value={form.houseNo} onChange={(v) => setForm((p) => ({ ...p, houseNo: v }))} required />
                  <InputField label="Street" value={form.street} onChange={(v) => setForm((p) => ({ ...p, street: v }))} required />
                  <InputField label="City" value={form.city} onChange={(v) => setForm((p) => ({ ...p, city: v }))} required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField label="Town (optional)" value={form.town} onChange={(v) => setForm((p) => ({ ...p, town: v }))} />
                  <InputField label="State" value={form.state} onChange={(v) => setForm((p) => ({ ...p, state: v }))} required />
                  <InputField label="Pin Code" value={form.pinCode} onChange={(v) => setForm((p) => ({ ...p, pinCode: v }))} required />
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-4">
                <SectionTitle title="Parent Details" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField label="Parent Name" value={form.parentName} onChange={(v) => setForm((p) => ({ ...p, parentName: v }))} required />
                  <InputField label="Occupation" value={form.parentOccupation} onChange={(v) => setForm((p) => ({ ...p, parentOccupation: v }))} required />
                  <InputField label="Office Address" value={form.officeAddress} onChange={(v) => setForm((p) => ({ ...p, officeAddress: v }))} required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField label="Parent Phone" value={form.parentPhone} onChange={(v) => setForm((p) => ({ ...p, parentPhone: v }))} required />
                  <InputField label="Parent Email" value={form.parentEmail} onChange={(v) => setForm((p) => ({ ...p, parentEmail: v }))} required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField label="WhatsApp" value={form.parentWhatsapp} onChange={(v) => setForm((p) => ({ ...p, parentWhatsapp: v }))} required />
                  <InputField label="Bank Account No" value={form.bankAccountNo} onChange={(v) => setForm((p) => ({ ...p, bankAccountNo: v }))} required />
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-4">
                <SectionTitle title="Emergency Contacts" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField label="Father No" value={form.emergencyFatherNo} onChange={(v) => setForm((p) => ({ ...p, emergencyFatherNo: v }))} required />
                  <InputField label="Mother No" value={form.emergencyMotherNo} onChange={(v) => setForm((p) => ({ ...p, emergencyMotherNo: v }))} required />
                  <InputField label="Guardian No" value={form.emergencyGuardianNo} onChange={(v) => setForm((p) => ({ ...p, emergencyGuardianNo: v }))} required />
                </div>
              </div>
            </div>

            {message && (
              <div
                className={`rounded-xl border p-4 ${
                  messageTone === "success"
                    ? "bg-lime-400/10 border-lime-400/20 text-lime-300"
                    : "bg-red-500/10 border-red-500/20 text-red-300"
                }`}
              >
                {message}
              </div>
            )}
          </motion.div>
        )}

        {view === "all" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10 space-y-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <div className="flex-1">
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by name, phone, aadhar..."
                    variant="glass"
                    icon={Search}
                  />
                </div>
                <div className="w-full md:w-[200px]">
                  <Select
                    label="Grade"
                    value={filters.gradeSought || ""}
                    onChange={(v) => setFilters((p) => ({ ...p, gradeSought: v }))}
                    options={[{ label: "All", value: "" }, ...GRADES]}
                  />
                </div>
                <div className="w-full md:w-[220px]">
                  <Select
                    label="Boarding"
                    value={filters.boardingType || ""}
                    onChange={(v) => setFilters((p) => ({ ...p, boardingType: v }))}
                    options={[{ label: "All", value: "" }, ...BOARDING]}
                  />
                </div>
                <div className="w-full md:w-[240px]">
                  <Select
                    label="Class"
                    value={filters.classId || ""}
                    onChange={(v) => setFilters((p) => ({ ...p, classId: v }))}
                    options={[
                      { label: "All", value: "" },
                      ...classes.map((c) => ({
                        label: c.section ? `${c.name}-${c.section}` : c.name,
                        value: c.id,
                      })),
                    ]}
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await exportExcel();
                    } catch (e) {
                      setMessageTone("error");
                      setMessage(e instanceof Error ? e.message : "Export failed");
                    }
                  }}
                  className="h-[44px] mt-[22px] md:mt-0 px-4 py-2 rounded-xl bg-lime-400/20 border border-lime-400/30 text-lime-300 font-semibold hover:bg-lime-400/30 flex items-center gap-2"
                  title="Export filtered results to Excel"
                >
                  <Download size={16} />
                  Export
                </button>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InputField
                  label="From (created date)"
                  type="date"
                  value={filters.from}
                  onChange={(v) => setFilters((p) => ({ ...p, from: v }))}
                />
                <InputField
                  label="To (created date)"
                  type="date"
                  value={filters.to}
                  onChange={(v) => setFilters((p) => ({ ...p, to: v }))}
                />
              </div>
            </div>

            <div className="hidden md:block">
              <DataTable
                columns={tableColumns}
                data={rows}
                loading={loading}
                showMobile={false}
                pagination={{ page, totalPages, onChange: setPage }}
              />
            </div>

            <div className="md:hidden space-y-3">
              {rows.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60 text-center">
                  No admissions found.
                </div>
              ) : (
                rows.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-white font-semibold">{`${r.firstName} ${r.lastName}`}</div>
                    <div className="text-white/50 text-xs mt-1">{`${r.gradeSought} • ${r.boardingType}`}</div>
                    <div className="text-white/50 text-xs mt-1">{`Phone: ${r.parentPhone}`}</div>
                    <div className="text-white/50 text-xs mt-1">
                      App fee: {formatInrCell(r.applicationFee)} · Adm fee: {formatInrCell(r.admissionFee)}
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          downloadFeeReceipt(r)
                        }
                        className="px-3 py-2 rounded-xl bg-lime-400/15 border border-lime-400/30 text-lime-300 text-xs"
                      >
                        Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`?tab=admission&view=add&editId=${r.id}`)}
                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteRow(r)}
                        className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
              <div className="flex items-center justify-between text-white/70 text-sm">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 disabled:opacity-50"
                >
                  Prev
                </button>
                <span>{`Page ${page} / ${totalPages}`}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {deleteRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1220] p-5 space-y-4">
            <div className="text-white font-semibold">Delete Admission</div>
            <p className="text-sm text-white/70">
              {`Are you sure you want to delete ${deleteRow.applicationNo} (${deleteRow.firstName} ${deleteRow.lastName})?`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteRow(null)}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-red-500/80 text-white font-semibold disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none opacity-0 fixed -top-[10000px] -left-[10000px]">
        <AdmissionReceiptTemplate ref={receiptRef} data={receiptData} />
      </div>
    </>
  );
}
