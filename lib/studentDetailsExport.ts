import * as XLSX from "xlsx";
import { buildAddressFromParts, formatStoredAddressForDisplay } from "@/lib/studentAddressFormat";
import { formatStudentClassForReport } from "@/lib/feeDayReportExcel";
import { resolveStudentDisplayClass } from "@/lib/resolveStudentDisplayClass";

/** Matches the "student details" sheet in `Student details report.xlsx` (header spelling preserved). */
export const STUDENT_DETAILS_EXPORT_HEADERS = [
  "S.no",
  "Admission Date",
  "Admission Number",
  "Student Name",
  "Class",
  "Gender",
  "Student Category",
  "Student Mobile",
  "Nationality",
  "Mother Tounge",
  "Religion",
  "Cast",
  "Date Of Birth",
  "Aadhar Number",
  "APAAR Id",
  "PEN Number",
  "Batch",
  "Father Name",
  "Mother Name",
  "Father Mobile",
  "Mother Mobile",
  "eMail Id ",
  "Present Address",
  "Permanent Address",
  "Status",
] as const;

export function formatDateDdMmYyyy(value: Date | string | null | undefined): string {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** Indian academic year label (Apr–Mar), e.g. May 2026 → "2026-27". */
export function academicYearBatchLabel(ref: Date = new Date()): string {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const start = m >= 3 ? y : y - 1;
  const end = start + 1;
  return `${start}-${String(end).slice(-2)}`;
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function cleanTenDigitPhone(value: string | null | undefined): string {
  const d = digitsOnly(value);
  if (d.length !== 10) return "";
  if (/^0+$/.test(d)) return "";
  return d;
}

function excelPhoneCell(value: string | null | undefined): string | number {
  const d = cleanTenDigitPhone(value);
  if (!d) return "";
  const n = Number(d);
  return Number.isFinite(n) ? n : d;
}

function mapStudentCategory(residencyType: string | null | undefined): string {
  const raw = (residencyType ?? "Day Scholar").trim();
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  if (compact.includes("hostel") || compact === "hosteller" || compact === "hostler") {
    return "Hostel";
  }
  if (compact.includes("transport")) return "Transport";
  if (compact === "dayscholar" || compact === "dayscholer" || raw === "") return "Day Scholar";
  return raw;
}

function titleCaseGender(g: string | null | undefined): string {
  const t = (g ?? "").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower === "male" || lower === "female") {
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function classLabelForStudent(student: ExportStudent): string {
  const resolved = resolveStudentDisplayClass(
    student.class,
    student.application?.class ?? null
  );
  return formatStudentClassForReport(resolved);
}

type ExportApplication = {
  createdAt: Date;
  nationality: string | null;
  languagesAtHome: string | null;
  religion: string | null;
  caste: string | null;
  parentPhone: string | null;
  emergencyMotherNo: string | null;
  parentEmail: string | null;
  motherName: string | null;
  houseNo: string | null;
  street: string | null;
  city: string | null;
  town: string | null;
  state: string | null;
  pinCode: string | null;
  class?: { name: string | null; section: string | null } | null;
} | null;

type ExportStudent = {
  createdAt: Date;
  admissionNumber: string;
  fatherName: string;
  motherName: string | null;
  phoneNo: string;
  dob: Date;
  gender: string | null;
  address: string | null;
  residencyType: string | null;
  aadhaarNo: string;
  penNumber: string | null;
  apaarId: string | null;
  user: { name: string | null; email: string | null } | null;
  class: { name: string | null; section: string | null } | null;
  application: ExportApplication;
  status?: string | null;
};

export function studentToDetailsExportRow(
  student: ExportStudent,
  index1Based: number
): (string | number)[] {
  const app = student.application;
  const admissionDate = app?.createdAt ?? student.createdAt;
  const studentName = (student.user?.name ?? "").trim();
  const presentFromApp = buildAddressFromParts([
    app?.houseNo,
    app?.city,
    app?.town,
    app?.state,
    app?.pinCode,
  ]);
  const permanentFromApp = buildAddressFromParts([
    app?.street,
    app?.city,
    app?.town,
    app?.state,
    app?.pinCode,
  ]);
  const fallbackAddr = formatStoredAddressForDisplay(student.address ?? "");
  const present =
    presentFromApp ||
    (fallbackAddr !== "—" ? fallbackAddr.replace(/\.$/, "").trim() : "");
  const permanent =
    permanentFromApp ||
    (fallbackAddr !== "—" ? fallbackAddr.replace(/\.$/, "").trim() : "");

  const motherMobileRaw = app?.emergencyMotherNo;
  const email =
    (app?.parentEmail ?? "").trim() ||
    (student.user?.email ?? "").trim();

  const aadharDigits = digitsOnly(student.aadhaarNo);

  return [
    index1Based,
    formatDateDdMmYyyy(admissionDate),
    student.admissionNumber,
    studentName,
    classLabelForStudent(student),
    titleCaseGender(student.gender),
    mapStudentCategory(student.residencyType),
    excelPhoneCell(student.phoneNo),
    (app?.nationality ?? "").trim() || "Indian",
    (app?.languagesAtHome ?? "").trim(),
    (app?.religion ?? "").trim(),
    (app?.caste ?? "").trim(),
    formatDateDdMmYyyy(student.dob),
    aadharDigits || "",
    (student.apaarId ?? "").trim(),
    (student.penNumber ?? "").trim(),
    academicYearBatchLabel(),
    student.fatherName,
    (student.motherName ?? app?.motherName ?? "").trim(),
    excelPhoneCell(app?.parentPhone ?? student.phoneNo),
    excelPhoneCell(motherMobileRaw),
    email,
    present,
    permanent || present,
    (student.status ?? "Active").trim(),
  ];
}

export function buildStudentDetailsExportWorkbook(rows: (string | number)[][]): XLSX.WorkBook {
  const aoa = [Array.from(STUDENT_DETAILS_EXPORT_HEADERS), ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "student details");
  return wb;
}
