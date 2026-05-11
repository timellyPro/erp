/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, Pencil, PlusCircle, Printer, Save, Search, Trash2, UserPlus, Loader2, IndianRupee, Download, ChevronDown } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import PageTabs from "../../schooladmin/schooladmincomponents/PageHeaderTabs";
import InputField from "../../schooladmin/schooladmincomponents/InputField";
import DataTable from "../../common/TableLayout";
import SearchInput from "../../common/SearchInput";
import AdmissionReceiptTemplate, { type AdmissionReceiptData } from "../../pdf/AdmissionReceiptTemplate";
import { formatResidencyTypeForDisplay } from "@/lib/residencyDisplay";

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
  | "GRADE_10"
  | "GRADE_11";

type AdmissionRow = {
  id: string;
  applicationNo: string;
  admissionNo: string | null;
  fedenaNo: string | null;
  studentId?: string | null;
  workflowStatus?: "PENDING" | "UPCOMING" | "APPROVED";
  classId?: string | null;
  class?: { id: string; name: string; section: string | null } | null;
  gradeSought: Grade;
  boardingType: BoardingType;
  residencyType?: string | null;
  totalFee?: number | null;
  discountPercent?: number | null;
  applicationFee?: number | null;
  admissionFee?: number | null;
  applicationFeePaid?: boolean;
  applicationFeePaidAt?: string | null;
  applicationFeePaymentMode?: string | null;
  applicationFeePaymentMethod?: string | null;
  admissionFeePaid?: boolean;
  admissionFeePaidAt?: string | null;
  admissionFeePaymentMode?: string | null;
  admissionFeePaymentMethod?: string | null;
  remarks?: string | null;
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

type FeeType = "APPLICATION" | "ADMISSION";
type FeeAssignRow = { id: string; name: string; amount: string };
type FeeHeadOption = { key: string; name: string; amount: number; selected: boolean };

type FormState = {
  applicationNo: string;
  fedenaNo: string;
  penNumber: string;
  apaarId: string;
  admissionNo: string;
  classId: string;
  gradeSought: Grade;
  boardingType: BoardingType;
  residencyType: string;
  applicationFee: string;
  admissionFee: string;
  studentName: string;
  gender: Gender;
  dateOfBirth: string; // yyyy-mm-dd
  aadharNo: string;
  firstLanguage: string;
  nationality: string;
  languagesAtHome: string;
  caste: string;
  religion: string;
  presentAddress: string;
  permanentAddress: string;
  parentName: string;
  parentOccupation: string;
  officeAddress: string;
  parentPhone: string;
  parentEmail: string;
  parentAadharNo: string;
  parentWhatsapp: string;
  bankAccountNo: string;
  motherName: string;
  motherPhone: string;
  motherAadharNo: string;
  motherEmail: string;
  panNumber: string;
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
  { label: "Grade 11", value: "GRADE_11" },
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
  penNumber: "",
  apaarId: "",
  admissionNo: "",
  classId: "",
  gradeSought: "GRADE_1",
  boardingType: "SEMI_RESIDENTIAL",
  residencyType: "Day Scholar",
  applicationFee: "",
  admissionFee: "",
  studentName: "",
  gender: "MALE",
  dateOfBirth: "",
  aadharNo: "",
  firstLanguage: "",
  nationality: "Indian",
  languagesAtHome: "",
  caste: "",
  religion: "",
  presentAddress: "",
  permanentAddress: "",
  parentName: "",
  parentOccupation: "",
  officeAddress: "",
  parentPhone: "",
  parentEmail: "",
  parentAadharNo: "",
  parentWhatsapp: "",
  bankAccountNo: "",
  motherName: "",
  motherPhone: "",
  motherAadharNo: "",
  motherEmail: "",
  panNumber: "",
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

function formatGradeLabel(g: string) {
  return g.replace(/^GRADE_/i, "Grade ").replace(/_/g, " ");
}

function formatBoardingLabel(b: string) {
  return b
    .split("_")
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" ");
}

function classLabel(r: AdmissionRow) {
  if (r.class?.name) {
    return r.class.section ? `${r.class.name} · ${r.class.section}` : r.class.name;
  }
  return "—";
}

function normalizeResidencyType(value: string | null | undefined): string {
  const v = (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!v) return "Day Scholar";
  if (v === "dayscholar" || v === "dayscholer") return "Day Scholar";
  if (v === "hostel" || v === "hostler" || v === "hosteler" || v === "hosteller" || v === "hoster") return "Hosteller";
  if (v === "rte") return "RTE";
  return value?.trim() || "Day Scholar";
}

function displayResidencyType(value: string | null | undefined): string {
  return formatResidencyTypeForDisplay(normalizeResidencyType(value));
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
  const [applicationsCount, setApplicationsCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<{ gradeSought: string; boardingType: string; from: string; to: string; classId: string }>({
    gradeSought: "",
    boardingType: "",
    from: "",
    to: "",
    classId: "",
  });
  const [listPhase, setListPhase] = useState<"all" | "pending" | "upcoming" | "approved">("all");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const [deleteRow, setDeleteRow] = useState<AdmissionRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [classes, setClasses] = useState<{ id: string; name: string; section: string | null }[]>([]);
  const [selectedClassName, setSelectedClassName] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<AdmissionReceiptData | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    row: AdmissionRow;
    feeType: FeeType;
  } | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    paymentMode: string;
    paymentMethod: string;
    referenceNo: string;
    remarks: string;
  }>({
    paymentMode: "OFFLINE",
    paymentMethod: "CASH",
    referenceNo: "",
    remarks: "",
  });
  const [feeAssignDialog, setFeeAssignDialog] = useState<AdmissionRow | null>(null);
  const [feeAssignRows, setFeeAssignRows] = useState<FeeAssignRow[]>([]);
  const [assigningFees, setAssigningFees] = useState(false);
  const [assignFeeError, setAssignFeeError] = useState<string | null>(null);
  const [existingStudentExtras, setExistingStudentExtras] = useState<Array<{ id: string; name: string; amount: number }>>([]);
  const [editingExistingFeeId, setEditingExistingFeeId] = useState<string | null>(null);
  const [editingExistingFeeName, setEditingExistingFeeName] = useState("");
  const [editingExistingFeeAmount, setEditingExistingFeeAmount] = useState("");
  const [dbFeeHeadOptions, setDbFeeHeadOptions] = useState<FeeHeadOption[]>([]);
  const [classBaseFeeTotal, setClassBaseFeeTotal] = useState<number | null>(null);

  const buildAdmissionExportQuery = useCallback(
    (format: "xlsx" | "csv" | "print") => {
      const params = new URLSearchParams();
      params.set("format", format);
      if (listPhase !== "all") params.set("phase", listPhase);
      if (search.trim()) params.set("search", search.trim());
      if (filters.gradeSought) params.set("gradeSought", filters.gradeSought);
      if (filters.boardingType) params.set("boardingType", filters.boardingType);
      if (filters.classId) params.set("classId", filters.classId);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      return params.toString();
    },
    [filters.boardingType, filters.classId, filters.from, filters.gradeSought, filters.to, listPhase, search]
  );

  const exportAdmissions = useCallback(
    (format: "xlsx" | "csv" | "print") => {
      const qs = buildAdmissionExportQuery(format);
      const url = `/api/admissions/export?${qs}`;
      if (format === "print") {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [buildAdmissionExportQuery]
  );

  const seededFeeRowsForResidency = useCallback((residencyType: string | null | undefined): FeeAssignRow[] => {
    const now = Date.now();
    const normalized = normalizeResidencyType(residencyType);
    if (normalized === "Hosteller") {
      return [{ id: `seed-${now}`, name: "Hostel Fee", amount: "" }];
    }
    if (normalized === "Day Scholar") {
      return [{ id: `seed-${now}`, name: "Transport Fee", amount: "" }];
    }
    return [{ id: `seed-${now}`, name: "", amount: "" }];
  }, []);

  const openAssignFeesDialog = useCallback(
    async (row: AdmissionRow) => {
      if (!row.studentId) {
        setMessageTone("error");
        setMessage("Approve enrollment first, then assign student-specific fees.");
        return;
      }
      setFeeAssignDialog(row);
      setFeeAssignRows(seededFeeRowsForResidency(row.residencyType));
      setAssignFeeError(null);
      setExistingStudentExtras([]);
      setDbFeeHeadOptions([]);
      setClassBaseFeeTotal(null);

      try {
        const [extrasRes, structureRes] = await Promise.all([
          fetch("/api/fees/extra", { credentials: "include", cache: "no-store" }),
          row.classId
            ? fetch(`/api/fees/structure?classId=${encodeURIComponent(row.classId)}`, {
                credentials: "include",
                cache: "no-store",
              })
            : Promise.resolve(null),
        ]);

        if (extrasRes.ok) {
          const extrasJson = await extrasRes.json().catch(() => ({}));
          const allExtras = Array.isArray(extrasJson?.extraFees) ? extrasJson.extraFees : [];
          const studentExtras = allExtras
            .filter((x: any) => x?.targetType === "STUDENT" && x?.targetStudentId === row.studentId)
            .map((x: any) => ({
              id: String(x.id),
              name: String(x.name ?? "Extra Fee"),
              amount: Number(x.amount ?? 0),
            }));
          setExistingStudentExtras(studentExtras);

          const classSection = row.class?.section ?? null;
          const rosterHeads = allExtras.filter((x: any) => {
            const t = String(x?.targetType ?? "");
            if (t === "SCHOOL") return true;
            if (t === "CLASS") return !!row.classId && x?.targetClassId === row.classId;
            if (t === "SECTION") {
              return !!row.classId && x?.targetClassId === row.classId && String(x?.targetSection ?? "") === String(classSection ?? "");
            }
            if (t === "STUDENT") return x?.targetStudentId === row.studentId;
            return false;
          });
          const byName = new Map<string, number>();
          for (const h of rosterHeads) {
            const name = String(h?.name ?? "").trim();
            const amount = Number(h?.amount ?? 0);
            if (!name || amount <= 0) continue;
            if (!byName.has(name)) byName.set(name, amount);
          }
          setDbFeeHeadOptions(
            Array.from(byName.entries())
              .map(([name, amount]) => ({
                key: `${name.toLowerCase()}|${amount}`,
                name,
                amount,
                selected: false,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        }

        if (structureRes && structureRes.ok) {
          const structureJson = await structureRes.json().catch(() => ({}));
          const first = Array.isArray(structureJson?.structures) ? structureJson.structures[0] : null;
          const components = Array.isArray(first?.components) ? first.components : [];
          const total = components.reduce((sum: number, c: any) => sum + (Number(c?.amount) || 0), 0);
          setClassBaseFeeTotal(total);
        }
      } catch {
        // Keep modal usable even if preview fetch fails.
      }
    },
    [seededFeeRowsForResidency]
  );

  const addAssignFeeRow = () => {
    setFeeAssignRows((prev) => [...prev, { id: `row-${Date.now()}-${Math.random()}`, name: "", amount: "" }]);
  };

  const addSelectedDbHeadsToRows = () => {
    const selected = dbFeeHeadOptions.filter((x) => x.selected);
    if (selected.length === 0) return;
    setFeeAssignRows((prev) => [
      ...prev,
      ...selected.map((x) => ({
        id: `db-${Date.now()}-${Math.random()}`,
        name: x.name,
        amount: String(x.amount),
      })),
    ]);
    setDbFeeHeadOptions((prev) => prev.map((x) => ({ ...x, selected: false })));
  };

  const updateExistingStudentFee = useCallback(async () => {
    if (!editingExistingFeeId) return;
    const name = editingExistingFeeName.trim();
    const amount = Number(editingExistingFeeAmount);
    if (!name || !Number.isFinite(amount) || amount <= 0) {
      setAssignFeeError("Enter valid fee name and amount.");
      return;
    }
    try {
      setAssignFeeError(null);
      const res = await fetch(`/api/fees/extra/${editingExistingFeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to update fee");
      setExistingStudentExtras((prev) =>
        prev.map((x) => (x.id === editingExistingFeeId ? { ...x, name, amount } : x))
      );
      setEditingExistingFeeId(null);
      setEditingExistingFeeName("");
      setEditingExistingFeeAmount("");
      setMessageTone("success");
      setMessage("Assigned fee updated.");
    } catch (e) {
      setAssignFeeError(e instanceof Error ? e.message : "Failed to update fee");
    }
  }, [editingExistingFeeAmount, editingExistingFeeId, editingExistingFeeName]);

  const deleteExistingStudentFee = useCallback(async (feeId: string) => {
    try {
      setAssignFeeError(null);
      const res = await fetch(`/api/fees/extra/${feeId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to delete fee");
      setExistingStudentExtras((prev) => prev.filter((x) => x.id !== feeId));
      setMessageTone("success");
      setMessage("Assigned fee deleted.");
    } catch (e) {
      setAssignFeeError(e instanceof Error ? e.message : "Failed to delete fee");
    }
  }, []);

  const saveAssignedFees = useCallback(async () => {
    if (!feeAssignDialog?.studentId) return;
    const cleaned = feeAssignRows
      .map((r) => ({ name: r.name.trim(), amount: Number(r.amount) }))
      .filter((r) => r.name.length > 0 && Number.isFinite(r.amount) && r.amount > 0);

    if (cleaned.length === 0) {
      setAssignFeeError("Add at least one fee with valid name and amount.");
      return;
    }

    setAssigningFees(true);
    setAssignFeeError(null);
    try {
      for (const row of cleaned) {
        const res = await fetch("/api/fees/extra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.name,
            amount: row.amount,
            targetType: "STUDENT",
            targetStudentId: feeAssignDialog.studentId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || `Failed to assign ${row.name}`);
      }
      setMessageTone("success");
      setMessage("Student fees assigned successfully.");
      setFeeAssignDialog(null);
    } catch (e) {
      setAssignFeeError(e instanceof Error ? e.message : "Failed to assign fees");
    } finally {
      setAssigningFees(false);
    }
  }, [feeAssignDialog, feeAssignRows]);

  useEffect(() => {
    // Fetch School Info
    fetch("/api/school/mine", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then(async (d) => {
        setSchoolName(typeof d?.school?.name === "string" ? d.school.name : "");
        const address = [d?.school?.address, d?.school?.location].filter((v: any) => typeof v === "string" && v.trim()).join(", ");
        setSchoolAddress(address);
        
        let parsedLogo = null;
        let rawLogoInfo = d?.school?.logoUrl;
        
        // Fallback 1: School Admin array returned by the API
        if (!rawLogoInfo && d?.school?.admins && d.school.admins.length > 0) {
          rawLogoInfo = d.school.admins[0].photoUrl;
        }

        // Fallback 2: Check active user's profile explicitly 
        if (!rawLogoInfo) {
          try {
            const userRes = await fetch("/api/user/me", { credentials: "include", cache: "no-store" });
            const userData = await userRes.json();
            if (userData?.user?.photoUrl) {
              rawLogoInfo = userData.user.photoUrl;
            }
          } catch {}
        }

        if (typeof rawLogoInfo === "string" && rawLogoInfo.trim()) {
          parsedLogo = rawLogoInfo.trim();
          
          // Use Nextjs media proxy for Supabase urls to avoid iframe CORS/Auth issues
          if (parsedLogo.includes("/storage/v1/object/")) {
            parsedLogo = `/api/media?url=${encodeURIComponent(parsedLogo)}`;
          }
          
          if (parsedLogo.startsWith("/")) {
            parsedLogo = window.location.origin + parsedLogo;
          }

          // Pre-fetch and convert logo to Base64 to guarantee it renders seamlessly inside the printing iframe
          try {
            const imgRes = await fetch(parsedLogo);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              const reader = new FileReader();
              reader.onloadend = () => {
                setSchoolLogo(reader.result as string);
              };
              reader.readAsDataURL(blob);
              return; // Exit early since FileReader sets state asynchronously
            }
          } catch (err) {
            console.error("Failed to convert logo to base64", err);
          }
        }
        
        // If absolutely no logo exists anywhere, dynamically generate one using the UI-Avatars API and the School Name
        if (!parsedLogo) {
          const fallbackName = typeof d?.school?.name === "string" ? d.school.name : "School";
          parsedLogo = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&size=128&background=4ade80&color=fff`;
          // Pre-fetch the generic avatar to Base64 to bypass any strict PDF frame blockers
          try {
            const fallbackRes = await fetch(parsedLogo);
            if (fallbackRes.ok) {
              const blob = await fallbackRes.blob();
              const reader = new FileReader();
              reader.onloadend = () => {
                setSchoolLogo(reader.result as string);
              };
              reader.readAsDataURL(blob);
              return;
            }
          } catch(e) {}
        }

        setSchoolLogo(parsedLogo);
      })
      .catch(() => {
        setSchoolName("");
        setSchoolAddress("");
        setSchoolLogo(null);
      });
  }, []);

  const printFeeReceipt = async (r: AdmissionRow, feeType: FeeType) => {
    const app = feeType === "APPLICATION" ? Number(r.applicationFee ?? 0) : 0;
    const adm = feeType === "ADMISSION" ? Number(r.admissionFee ?? 0) : 0;
    const paidAt =
      feeType === "APPLICATION" ? r.applicationFeePaidAt : r.admissionFeePaidAt;
    const data: AdmissionReceiptData = {
      schoolName: schoolName || "School",
      schoolLogo,
      schoolAddress: schoolAddress || "-",
      applicationNo: r.applicationNo || "-",
      admissionNo: r.admissionNo || null,
      studentName: `${r.firstName} ${r.lastName}`.trim() || "Student",
      className: r.class ? `${r.class.name}${r.class.section ? `-${r.class.section}` : ""}` : r.gradeSought,
      gradeSought: r.gradeSought,
      boardingType: r.boardingType,
      residencyType: displayResidencyType(r.residencyType),
      parentName: r.parentName || "-",
      parentPhone: r.parentPhone || "-",
      createdAt: paidAt ? new Date(paidAt).toLocaleString() : new Date(r.createdAt).toLocaleString(),
      applicationFee: app,
      admissionFee: adm,
      total: app + adm,
      receiptType: feeType,
    };

    setReceiptData(data);
    
    setTimeout(() => {
      const html = receiptRef.current?.innerHTML;
      if (!html) return;

      // Create a hidden iframe for silent printing
      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        // Load the HTML and Tailwind CSS, wait a second for CSS to apply, then trigger print
        iframeDoc.write(`
          <html>
            <head>
              <title>Fee Receipt</title>
              <script src="https://cdn.tailwindcss.com"></script>
              <style>
                @page { margin: 0; }
                body { margin: 1cm; }
              </style>
            </head>
            <body>
              ${html}
              <script>
                setTimeout(() => { 
                  window.focus(); 
                  window.print(); 
                }, 1500);
              </script>
            </body>
          </html>
        `);
        iframeDoc.close();
      }

      // Cleanup iframe after printing dialog has most likely closed
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 10000);
    }, 200);
  };

  const markFeePaid = async (row: AdmissionRow, feeType: FeeType) => {
    setPaying(true);
    setPaymentError(null);
    try {
      if ((paymentForm.paymentMethod === "UPI" || paymentForm.paymentMethod === "BANK_TRANSFER") && !paymentForm.referenceNo.trim()) {
        throw new Error("Reference number / UTR is required for UPI and Bank Transfer");
      }
      const res = await fetch(`/api/admissions/${row.id}/fee-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeType,
          paymentMode: paymentForm.paymentMode,
          paymentMethod: paymentForm.paymentMethod,
          referenceNo: paymentForm.referenceNo,
          remarks: paymentForm.remarks,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Failed to mark fee as paid");
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                applicationFeePaid:
                  feeType === "APPLICATION"
                    ? true
                    : r.applicationFeePaid ?? false,
                applicationFeePaidAt:
                  feeType === "APPLICATION"
                    ? new Date().toISOString()
                    : r.applicationFeePaidAt ?? null,
                applicationFeePaymentMode:
                  feeType === "APPLICATION"
                    ? paymentForm.paymentMode
                    : r.applicationFeePaymentMode ?? null,
                applicationFeePaymentMethod:
                  feeType === "APPLICATION"
                    ? paymentForm.referenceNo
                      ? `${paymentForm.paymentMethod} | REF:${paymentForm.referenceNo}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                      : `${paymentForm.paymentMethod}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                    : r.applicationFeePaymentMethod ?? null,
                admissionFeePaid:
                  feeType === "ADMISSION" ? true : r.admissionFeePaid ?? false,
                admissionFeePaidAt:
                  feeType === "ADMISSION"
                    ? new Date().toISOString()
                    : r.admissionFeePaidAt ?? null,
                admissionFeePaymentMode:
                  feeType === "ADMISSION"
                    ? paymentForm.paymentMode
                    : r.admissionFeePaymentMode ?? null,
                admissionFeePaymentMethod:
                  feeType === "ADMISSION"
                    ? paymentForm.referenceNo
                      ? `${paymentForm.paymentMethod} | REF:${paymentForm.referenceNo}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                      : `${paymentForm.paymentMethod}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                    : r.admissionFeePaymentMethod ?? null,
                remarks:
                  feeType === "ADMISSION" || feeType === "APPLICATION"
                    ? paymentForm.remarks || null
                    : r.remarks ?? null,
              }
            : r
        )
      );
      setMessageTone("success");
      setMessage(data?.message || "Fee marked as paid");
      setPaymentDialog(null);
      setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Failed to mark fee as paid");
    } finally {
      setPaying(false);
    }
  };

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
  }, []);

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
      setMessageTone("success");
      setMessage(data?.message || "Student created successfully");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setWorkflowBusyId(null);
    }
  }, []);

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
      {
        header: "Application no.",
        render: (r: AdmissionRow) => (
          <span className="text-sm font-mono text-white/85">{r.applicationNo || "—"}</span>
        ),
      },
      {
        header: "Applicant",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/80">{`${r.firstName} ${r.lastName}`.trim()}</span>
        ),
      },
      {
        header: "Class (applied for)",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/70">{classLabel(r)}</span>
        ),
      },
      {
        header: "Grade sought",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/70">{formatGradeLabel(r.gradeSought)}</span>
        ),
      },
      {
        header: "Boarding",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/70">{formatBoardingLabel(r.boardingType)}</span>
        ),
      },
      {
        header: "Residency",
        render: (r: AdmissionRow) => (
          <span className="text-sm text-white/70">{displayResidencyType(r.residencyType)}</span>
        ),
      },
      {
        header: "Parent",
        render: (r: AdmissionRow) => (
          <div className="text-sm text-white/70">
            <div className="text-white/80">{r.parentName}</div>
            <div className="text-xs text-white/50">{r.parentPhone}</div>
          </div>
        ),
      },
      {
        header: "Aadhar",
        render: (r: AdmissionRow) => (
          <span className="text-xs font-mono text-white/60">{r.aadharNo || "—"}</span>
        ),
      },
      {
        header: "Fees (record)",
        render: (r: AdmissionRow) => (
          <div className="text-xs text-white/65 leading-relaxed">
            <div>App: {formatInrCell(r.applicationFee)}</div>
            <div>Adm: {formatInrCell(r.admissionFee)}</div>
          </div>
        ),
      },
      {
        header: "Application status",
        render: (r: AdmissionRow) => {
          if (r.studentId) {
            return (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle size={12} />
                Enrolled
              </span>
            );
          }
          const wf = r.workflowStatus ?? "PENDING";
          if (wf === "UPCOMING") {
            return (
              <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/30">
                Upcoming
              </span>
            );
          }
          return (
            <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-200 border border-amber-500/25">
              Pending
            </span>
          );
        },
      },
      { header: "Applied on", render: (r: AdmissionRow) => <span className="text-sm text-white/60">{new Date(r.createdAt).toLocaleDateString()}</span> },
      {
        header: "Actions",
        render: (r: AdmissionRow) => {
          const busy = workflowBusyId === r.id;
          const enrolled = Boolean(r.studentId);
          const wf = r.workflowStatus ?? "PENDING";
          const openPay = (feeType: FeeType) => {
            setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
            setPaymentDialog({ row: r, feeType });
          };
          return (
            <div className="flex flex-col gap-2 items-start min-w-[220px]">
              <div className="flex flex-wrap items-center gap-1">
                {Number(r.applicationFee ?? 0) > 0 &&
                  (r.applicationFeePaid ? (
                    <button
                      type="button"
                      onClick={() => printFeeReceipt(r, "APPLICATION")}
                      className="inline-flex items-center justify-center rounded-md border border-lime-400/25 bg-lime-400/10 p-1.5 text-lime-300 hover:bg-lime-400/20"
                      title="Print application fee receipt"
                    >
                      <Printer size={13} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPay("APPLICATION")}
                      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200 hover:bg-amber-500/20"
                      title="Pay application fee"
                    >
                      Pay app
                    </button>
                  ))}
                {Number(r.admissionFee ?? 0) > 0 &&
                  (r.admissionFeePaid ? (
                    <button
                      type="button"
                      onClick={() => printFeeReceipt(r, "ADMISSION")}
                      className="inline-flex items-center justify-center rounded-md border border-lime-400/25 bg-lime-400/10 p-1.5 text-lime-300 hover:bg-lime-400/20"
                      title="Print admission fee receipt"
                    >
                      <Printer size={13} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPay("ADMISSION")}
                      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200 hover:bg-amber-500/20"
                      title="Pay admission fee"
                    >
                      Pay adm
                    </button>
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!enrolled && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => enrollFromRow(r)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-lime-400/20 border border-lime-400/35 text-lime-200 hover:bg-lime-400/30 disabled:opacity-50"
                    title="Approve to create the student"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                    {busy ? "Approving..." : "Approve"}
                  </button>
                )}
                {enrolled && (
                  <button
                    type="button"
                    onClick={() => openAssignFeesDialog(r)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-sky-500/20 border border-sky-500/35 text-sky-100 hover:bg-sky-500/30"
                    title="Assign extra fees like transport / hostel"
                  >
                    <IndianRupee size={12} />
                    Assign fees
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push(`?tab=admission&view=add&editId=${r.id}`)}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
                  title={enrolled ? "View / edit application" : "Edit application"}
                >
                  <Pencil size={14} />
                </button>
                {!enrolled && (
                  <button
                    type="button"
                    onClick={() => setDeleteRow(r)}
                    className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20"
                    title="Delete application"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        },
      },
    ],
    [router, schoolName, schoolAddress, printFeeReceipt, patchWorkflow, enrollFromRow, workflowBusyId]
  );

  useEffect(() => {
    if (view !== "all") return;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "10");
    if (listPhase !== "all") params.set("phase", listPhase);
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
        setApplicationsCount(total);
        const pageSize = Number(d?.pageSize ?? 10);
        const computed = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
        setTotalPages(computed);
        setPage((p) => Math.min(p, computed));
      })
      .catch((e) => {
        setRows([]);
        setApplicationsCount(0);
        setTotalPages(1);
        setMessageTone("error");
        setMessage(e instanceof Error ? e.message : "Failed to load admissions");
      })
      .finally(() => setLoading(false));
  }, [view, page, search, filters.gradeSought, filters.boardingType, filters.classId, filters.from, filters.to, listPhase, reloadKey]);

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
          penNumber: (a as any).penNumber ?? "",
          apaarId: (a as any).apaarId ?? "",
          admissionNo: a.admissionNo ?? "",
          classId: a.classId ?? "",
          gradeSought: a.gradeSought,
          boardingType: a.boardingType,
          residencyType: normalizeResidencyType(a.residencyType),
          applicationFee:
            a.applicationFee === null || a.applicationFee === undefined ? "" : String(a.applicationFee),
          admissionFee: a.admissionFee === null || a.admissionFee === undefined ? "" : String(a.admissionFee),
          studentName: [a.firstName, a.middleName, a.lastName].filter(Boolean).join(" "),
          gender: a.gender,
          dateOfBirth: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : "",
          aadharNo: a.aadharNo ?? "",
          firstLanguage: a.firstLanguage ?? "",
          nationality: a.nationality ?? "Indian",
          languagesAtHome: a.languagesAtHome ?? "",
          caste: a.caste ?? "",
          religion: a.religion ?? "",
          presentAddress: a.houseNo ?? "",
          permanentAddress: a.street ?? "",
          parentName: a.parentName ?? "",
          parentOccupation: a.parentOccupation ?? "",
          officeAddress: a.officeAddress ?? "",
          parentPhone: a.parentPhone ?? "",
          parentEmail: a.parentEmail ?? "",
          parentAadharNo: a.parentAadharNo ?? "",
          parentWhatsapp: a.parentWhatsapp ?? "",
          bankAccountNo: a.bankAccountNo ?? "",
          motherName: (a as any).motherName ?? "",
          // Mother phone is stored on the application as `emergencyMotherNo` (same as student profile).
          motherPhone: (() => {
            const em = String((a as { emergencyMotherNo?: string | null }).emergencyMotherNo ?? "").trim();
            if (em && em !== "-") return em;
            return "";
          })(),
          motherAadharNo: (a as any).motherAadharNo ?? "",
          motherEmail: (a as any).motherEmail ?? "",
          panNumber: (a as any).panNumber ?? "",
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
      const nameParts = form.studentName.trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] ?? "";
      const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : null;
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ".";
      const payload: any = {
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

  return (
    <>
      <PageHeader
        title="Admission"
        subtitle={
          view === "all"
            ? "This list is admission applications only. The enrolled student roster is under the Students tab."
            : "Track applications as Pending → Upcoming, then approve to create the school student automatically."
        }
        rightSlot={
          <PageTabs
            tabs={[
              { label: "New Application", value: "add" },
              { label: `Applications (${applicationsCount})`, value: "all" },
            ]}
            queryKey="view"
          />
        }
      />

      <div className="w-full min-w-0 max-w-full space-y-6">
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
                      } catch {
                        // Error message already set on the form; do not leave edit view on failed save.
                      }
                    }}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-lime-400 text-black font-semibold hover:bg-lime-500 disabled:opacity-60 flex items-center gap-2"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {submitting ? "Saving..." : editId ? "Update" : "Save"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InputField
                  label="Timelly No (optional)"
                  value={form.fedenaNo}
                  onChange={(v) => setForm((p) => ({ ...p, fedenaNo: v }))}
                />
                <InputField
                  label="PEN Number (optional)"
                  value={form.penNumber}
                  onChange={(v) => setForm((p) => ({ ...p, penNumber: v }))}
                />
                <InputField
                  label="APAAR ID (optional)"
                  value={form.apaarId}
                  onChange={(v) => setForm((p) => ({ ...p, apaarId: v }))}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    { label: "Hostel", value: "Hosteller" },
                    { label: "RTE", value: "RTE" },
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
                  label="Application Number"
                  value={form.applicationNo}
                  onChange={(v) => setForm((p) => ({ ...p, applicationNo: v }))}
                  required
                />
                <InputField
                  label="STUDENT NAME"
                  value={form.studentName}
                  onChange={(v) => setForm((p) => ({ ...p, studentName: v }))}
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
                  label="ADHAAR ID (optional)"
                  value={form.aadharNo}
                  onChange={(v) => setForm((p) => ({ ...p, aadharNo: v }))}
                />
                <InputField
                  label="PAN Number (optional)"
                  value={form.panNumber}
                  onChange={(v) => setForm((p) => ({ ...p, panNumber: v }))}
                />
              </div>

              <p className="text-xs text-white/50 -mt-2 mb-2">
                Tuition for enrolled students comes from the school admin global fee structure for each class, not from this form.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Present Address" value={form.presentAddress} onChange={(v) => setForm((p) => ({ ...p, presentAddress: v }))} required />
                  <InputField label="Permanent Address" value={form.permanentAddress} onChange={(v) => setForm((p) => ({ ...p, permanentAddress: v }))} required />
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
                  <InputField label="Parent Email" value={form.parentEmail} onChange={(v) => setForm((p) => ({ ...p, parentEmail: v }))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField label="WhatsApp" value={form.parentWhatsapp} onChange={(v) => setForm((p) => ({ ...p, parentWhatsapp: v }))} required />
                  <InputField label="Aadhar Number (optional)" value={form.bankAccountNo} onChange={(v) => setForm((p) => ({ ...p, bankAccountNo: v }))} />
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-4">
                <SectionTitle title="Mother Details" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <InputField label="Mother Name" value={form.motherName} onChange={(v) => setForm((p) => ({ ...p, motherName: v }))} />
                  <InputField label="Phone Number" value={form.motherPhone} onChange={(v) => setForm((p) => ({ ...p, motherPhone: v }))} />
                  <InputField label="Aadhar Number" value={form.motherAadharNo} onChange={(v) => setForm((p) => ({ ...p, motherAadharNo: v }))} />
                  <InputField label="Email ID" value={form.motherEmail} onChange={(v) => setForm((p) => ({ ...p, motherEmail: v }))} />
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
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full min-w-0 max-w-full space-y-4"
          >
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
                    label="Class applied for"
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
                <div className="relative w-full md:w-auto md:ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowExportMenu((v) => !v)}
                    className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
                  >
                    <Download size={16} />
                    Export
                    <ChevronDown size={14} className={`transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 z-20 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          exportAdmissions("xlsx");
                        }}
                        className="block w-full px-4 py-2.5 text-left text-sm text-white/85 hover:bg-white/10"
                      >
                        Export Excel (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          exportAdmissions("csv");
                        }}
                        className="block w-full px-4 py-2.5 text-left text-sm text-white/85 hover:bg-white/10"
                      >
                        Export CSV (.csv)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          exportAdmissions("print");
                        }}
                        className="block w-full px-4 py-2.5 text-left text-sm text-white/85 hover:bg-white/10"
                      >
                        Export PDF (Print)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "pending" as const, label: "Pending" },
                    { id: "approved" as const, label: "Enrolled" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setListPhase(tab.id);
                      setPage(1);
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                      listPhase === tab.id
                        ? "bg-lime-400/25 border-lime-400/40 text-lime-200"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
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

            <div className="hidden w-full min-w-0 max-w-full md:block isolate">
              <div className="max-w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                <DataTable
                  columns={tableColumns}
                  data={rows}
                  loading={loading}
                  showMobile={false}
                  container={false}
                  rounded={false}
                  scrollableWide
                  caption="Admission applications for this school"
                  tableTitle="Applications"
                  tableSubtitle="Admission applications only — not the Students tab. Scroll sideways if needed."
                  containerClassName="max-w-full"
                  emptyText="No admission applications match your filters."
                  paginationInline
                  pagination={{ page, totalPages, onChange: setPage }}
                />
              </div>
            </div>

            <div className="md:hidden space-y-3">
              {rows.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60 text-center">
                  No admissions found.
                </div>
              ) : (
                rows.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-white/45 text-[10px] font-semibold uppercase tracking-wide">App #{r.applicationNo}</div>
                    <div className="text-white font-semibold mt-0.5">{`${r.firstName} ${r.lastName}`}</div>
                    <div className="text-white/50 text-xs mt-1">
                      {classLabel(r)} · {formatGradeLabel(r.gradeSought)} · {formatBoardingLabel(r.boardingType)}
                    </div>
                    <div className="text-white/50 text-xs mt-0.5">{displayResidencyType(r.residencyType)}</div>
                    <div className="text-white/50 text-xs mt-1">
                      {r.parentName} · {r.parentPhone}
                    </div>
                    <div className="text-white/50 text-xs mt-1">Aadhaar: {r.aadharNo}</div>
                    <div className="text-white/50 text-xs mt-1">
                      App: {formatInrCell(r.applicationFee)} · Adm: {formatInrCell(r.admissionFee)}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {r.studentId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle size={12} />
                          Enrolled
                        </span>
                      ) : (r.workflowStatus ?? "PENDING") === "UPCOMING" ? (
                        <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/30">
                          Upcoming
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-200 border border-amber-500/25">
                          Pending
                        </span>
                      )}
                    </div>
                    {!r.studentId && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={workflowBusyId === r.id}
                          onClick={() => enrollFromRow(r)}
                          className="flex-1 min-w-[120px] px-3 py-2 rounded-xl bg-lime-400/20 border border-lime-400/35 text-lime-200 text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1"
                        >
                          {workflowBusyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                          {workflowBusyId === r.id ? "Approving..." : "Approve & enroll"}
                        </button>
                      </div>
                    )}
                    {r.studentId && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => openAssignFeesDialog(r)}
                          className="w-full px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs inline-flex items-center justify-center gap-1"
                        >
                          <IndianRupee size={13} />
                          Assign Extra Fees
                        </button>
                      </div>
                    )}
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Number(r.applicationFee ?? 0) > 0 && !r.applicationFeePaid && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
                            setPaymentDialog({ row: r, feeType: "APPLICATION" });
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs"
                        >
                          Pay App Fee
                        </button>
                      )}
                      {Number(r.admissionFee ?? 0) > 0 && !r.admissionFeePaid && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
                            setPaymentDialog({ row: r, feeType: "ADMISSION" });
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs"
                        >
                          Pay Adm Fee
                        </button>
                      )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                      {r.applicationFeePaid && (
                        <button
                          type="button"
                          onClick={() => printFeeReceipt(r, "APPLICATION")}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-lime-400/15 border border-lime-400/30 text-lime-300 text-xs"
                          title="Print application fee receipt"
                        >
                          <Printer size={13} />
                          Print App Receipt
                        </button>
                      )}
                      {r.admissionFeePaid && (
                        <button
                          type="button"
                          onClick={() => printFeeReceipt(r, "ADMISSION")}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-lime-400/15 border border-lime-400/30 text-lime-300 text-xs"
                          title="Print admission fee receipt"
                        >
                          <Printer size={13} />
                          Print Adm Receipt
                        </button>
                      )}
                      </div>

                      <div className={`grid gap-2 ${r.studentId ? "grid-cols-1" : "grid-cols-2"}`}>
                      <button
                        type="button"
                        onClick={() => router.push(`?tab=admission&view=add&editId=${r.id}`)}
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs"
                      >
                        Edit
                      </button>
                      {!r.studentId && (
                        <button
                          type="button"
                          onClick={() => setDeleteRow(r)}
                          className="w-full px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
                        >
                          Delete
                        </button>
                      )}
                      </div>
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

      {paymentDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1220] p-5 space-y-4">
            <div className="text-white font-semibold">
              {paymentDialog.feeType === "APPLICATION"
                ? "Pay Application Fee"
                : "Pay Admission Fee"}
            </div>
            <p className="text-sm text-white/70">
              {`${paymentDialog.row.firstName} ${paymentDialog.row.lastName}`}
            </p>
            {paymentError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                {paymentError}
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select
                  label="Payment Mode"
                  value={paymentForm.paymentMode}
                  onChange={(v) => setPaymentForm((p) => ({ ...p, paymentMode: v }))}
                  options={[
                    { label: "Offline", value: "OFFLINE" },
                    { label: "Online", value: "ONLINE" },
                  ]}
                />
                <Select
                  label="Payment Method"
                  value={paymentForm.paymentMethod}
                  onChange={(v) => setPaymentForm((p) => ({ ...p, paymentMethod: v }))}
                  options={[
                    { label: "Cash", value: "CASH" },
                    { label: "Cheque", value: "CHEQUE" },
                    { label: "UPI", value: "UPI" },
                    { label: "Bank Transfer", value: "BANK_TRANSFER" },
                    { label: "Card", value: "CARD" },
                  ]}
                />
              </div>
              {(paymentForm.paymentMethod === "UPI" || paymentForm.paymentMethod === "BANK_TRANSFER") && (
                <InputField
                  label="Reference Number / UTR"
                  value={paymentForm.referenceNo}
                  onChange={(v) => setPaymentForm((p) => ({ ...p, referenceNo: v }))}
                  required
                />
              )}
              <InputField
                label="Remarks"
                value={paymentForm.remarks}
                onChange={(v) => setPaymentForm((p) => ({ ...p, remarks: v }))}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaymentDialog(null)}
                disabled={paying}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => markFeePaid(paymentDialog.row, paymentDialog.feeType)}
                disabled={paying}
                className="px-4 py-2 rounded-xl bg-lime-400 text-black font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {paying && <Loader2 size={16} className="animate-spin" />}
                {paying ? "Processing..." : "Pay Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {feeAssignDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0B1220] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-white font-semibold">Assign Fees</div>
                <p className="text-sm text-white/70">
                  {`${feeAssignDialog.firstName} ${feeAssignDialog.lastName}`} · {classLabel(feeAssignDialog)} · {displayResidencyType(feeAssignDialog.residencyType)}
                </p>
              </div>
              {classBaseFeeTotal !== null && (
                <div className="text-right text-xs text-white/60">
                  <div>Class structure (base)</div>
                  <div className="text-white/80 font-semibold">{formatInrCell(classBaseFeeTotal)}</div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              Global class fee structure is already applied on enrollment. Use this section for student-level extras like transport, hostel, books, etc.
            </div>

            {existingStudentExtras.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
                <div className="text-xs font-semibold text-white/80">Already assigned extras</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {existingStudentExtras.map((ef) => (
                    <div key={ef.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 space-y-2">
                      {editingExistingFeeId === ef.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editingExistingFeeName}
                            onChange={(e) => setEditingExistingFeeName(e.target.value)}
                            className="w-full rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-white"
                            placeholder="Fee name"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingExistingFeeAmount}
                            onChange={(e) => setEditingExistingFeeAmount(e.target.value)}
                            className="w-full rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-white"
                            placeholder="Amount"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={updateExistingStudentFee}
                              className="rounded-lg bg-lime-500/20 px-2 py-1 text-[11px] text-lime-200"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingExistingFeeId(null);
                                setEditingExistingFeeName("");
                                setEditingExistingFeeAmount("");
                              }}
                              className="rounded-lg border border-white/20 px-2 py-1 text-[11px] text-white/70"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-white/90">{ef.name}</span> · {formatInrCell(ef.amount)}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingExistingFeeId(ef.id);
                                setEditingExistingFeeName(ef.name);
                                setEditingExistingFeeAmount(String(ef.amount));
                              }}
                              className="rounded-lg border border-white/20 px-2 py-1 text-[11px] text-white/80"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteExistingStudentFee(ef.id)}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dbFeeHeadOptions.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                <div className="text-xs font-semibold text-white/80">Fee heads from DB (select to reuse)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-44 overflow-auto pr-1">
                  {dbFeeHeadOptions.map((h) => (
                    <label key={h.key} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
                      <input
                        type="checkbox"
                        checked={h.selected}
                        onChange={(e) =>
                          setDbFeeHeadOptions((prev) =>
                            prev.map((x) => (x.key === h.key ? { ...x, selected: e.target.checked } : x))
                          )
                        }
                      />
                      <span className="flex-1">{h.name}</span>
                      <span>{formatInrCell(h.amount)}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={addSelectedDbHeadsToRows}
                    className="px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs"
                  >
                    Add selected heads
                  </button>
                </div>
              </div>
            )}

            {assignFeeError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                {assignFeeError}
              </div>
            )}

            <div className="space-y-2">
              {feeAssignRows.map((row) => (
                <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_160px_90px] gap-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) =>
                      setFeeAssignRows((prev) =>
                        prev.map((x) => (x.id === row.id ? { ...x, name: e.target.value } : x))
                      )
                    }
                    className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
                    placeholder="Fee name (e.g. Transport Fee / Hostel Fee)"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) =>
                      setFeeAssignRows((prev) =>
                        prev.map((x) => (x.id === row.id ? { ...x, amount: e.target.value } : x))
                      )
                    }
                    className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
                    placeholder="Amount"
                  />
                  <button
                    type="button"
                    onClick={() => setFeeAssignRows((prev) => prev.filter((x) => x.id !== row.id))}
                    className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={addAssignFeeRow}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm hover:bg-white/10"
              >
                + Add another fee
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFeeAssignDialog(null)}
                  disabled={assigningFees}
                  className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAssignedFees}
                  disabled={assigningFees}
                  className="px-4 py-2 rounded-xl bg-lime-400 text-black font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {assigningFees && <Loader2 size={16} className="animate-spin" />}
                  {assigningFees ? "Assigning..." : "Save Fees"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                className="px-4 py-2 rounded-xl bg-red-500/80 text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 size={16} className="animate-spin" />}
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
