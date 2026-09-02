import { ClassItem, StudentFormState, StudentRow } from "./types";
import type { StudentApplicationSummary } from "../../../interfaces/student";
import { ageFromDob, formatDobYmd } from "@/lib/dobCalendar";

export const isAdmissionStudent = (student: StudentRow): boolean => {
  const app = student.application;
  if (!app) return false;
  if (app.workflowStatus === "APPROVED") return true;
  if ((app.admissionNo ?? "").trim()) return true;
  if ((app.fedenaNo ?? "").trim()) return true;
  return false;
};

const getStudentSortTimestamp = (
  student: StudentRow,
  app?: StudentApplicationSummary | null
): number => {
  const raw = app?.createdAt ?? student.createdAt;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
};

/** Admission students first (latest admission on top), then previous students. */
export const sortStudentsForDisplay = (students: StudentRow[]): StudentRow[] =>
  [...students].sort((a, b) => {
    const aAdmission = isAdmissionStudent(a);
    const bAdmission = isAdmissionStudent(b);
    if (aAdmission !== bAdmission) return aAdmission ? -1 : 1;
    return getStudentSortTimestamp(b, b.application) - getStudentSortTimestamp(a, a.application);
  });

export const getInitials = (name?: string | null) => {
  if (!name) return "ST";
  const parts = name.trim().split(" ").filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
};

export const getAge = (dob?: string | null) => {
  const age = ageFromDob(dob);
  return age == null ? "-" : String(age);
};

export const toStudentForm = (student: StudentRow): StudentFormState => ({
  name: student.user?.name || student.name || "",
  rollNo: student.rollNo || "",
  penNumber: (student as { penNumber?: string }).penNumber || "",
  apaarId: (student as { apaarId?: string }).apaarId || "",
  gender: student.gender || "",
  residencyType: student.residencyType || "Day Scholar",
  dob: formatDobYmd(student.dob) || "",
  classId: student.class?.id || "",
  section: student.class?.section || "",
  status: student.status || "Active",
  fatherName: student.fatherName || "",
  motherName: (student as { motherName?: string }).motherName || "",
  occupation: (student as { occupation?: string }).occupation || "",
  officeAddress: "",
  phoneNo: student.phoneNo || "",
  email: student.user?.email || (student as { email?: string }).email || "",
  address: student.address || "",
  aadhaarNo: student.aadhaarNo || "",
  parentAadharNo: (student as { parentAadharNo?: string }).parentAadharNo || "",
  parentWhatsapp: "",
  bankAccountNo: "",
  totalFee: "",
  discountPercent: "",
  applicationFee:
    student.applicationFee != null && student.applicationFee !== undefined
      ? String(student.applicationFee)
      : "",
  admissionFee:
    student.admissionFee != null && student.admissionFee !== undefined
      ? String(student.admissionFee)
      : "",
  previousSchool: student.previousSchool || "",
  houseNo: "",
  street: "",
  city: "",
  town: "",
  state: "",
  pinCode: "",
  nationality: "Indian",
  languagesAtHome: "",
  caste: "",
  religion: "",
  emergencyFatherNo: "",
  emergencyMotherNo: "",
  emergencyGuardianNo: "",
  subjects: Array.isArray((student as { subjects?: string[] }).subjects)
    ? [...((student as { subjects?: string[] }).subjects || [])]
    : [],
});

/** Merge edit form values into a list row for immediate UI updates after a successful save. */
export function mergeStudentAfterEdit(
  prev: StudentRow,
  form: StudentFormState,
  resolvedClass: ClassItem | null
): StudentRow {
  const name = form.name.trim() || prev.user?.name || prev.name || "";

  let nextClass = prev.class ?? null;
  if (form.classId && resolvedClass?.id === form.classId) {
    nextClass = {
      id: resolvedClass.id,
      name: resolvedClass.name,
      section: resolvedClass.section || "",
    };
  }

  return {
    ...prev,
    name,
    rollNo: form.rollNo.trim() || prev.rollNo,
    penNumber: form.penNumber.trim() || (prev as { penNumber?: string }).penNumber,
    apaarId: form.apaarId.trim() || (prev as { apaarId?: string }).apaarId,
    fatherName: form.fatherName.trim() || prev.fatherName,
    motherName: form.motherName.trim() || prev.motherName,
    occupation: form.occupation.trim() || prev.occupation,
    phoneNo: form.phoneNo.trim() || prev.phoneNo,
    address: form.address.trim() || prev.address,
    gender: form.gender.trim() || prev.gender,
    residencyType: form.residencyType.trim() || prev.residencyType,
    previousSchool: form.previousSchool.trim() || prev.previousSchool,
    status: form.status || prev.status,
    class: nextClass,
    subjects: Array.isArray(form.subjects) ? [...form.subjects] : prev.subjects,
    user: prev.user ? { ...prev.user, name } : prev.user,
  };
}
